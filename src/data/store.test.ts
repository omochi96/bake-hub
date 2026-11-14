import { describe, expect, it } from "vitest";
import { initialData, normalize } from "./seed";
import { applyOps } from "./store";

describe("初期データ", () => {
  it("旧版と同じく、見本1つ + 初期の9商品。写真は商品idに付く", () => {
    const { data, photos } = normalize(initialData());
    expect(data.prods).toHaveLength(10);
    expect(data.prods.map((p) => p.name)).toContain("有機レーズンとカシューナッツ");
    const raisin = data.prods.find((p) => p.name.includes("レーズン"))!;
    expect(photos[raisin.id]).toBe("builtin:レーズン");
    expect(photos.p1).toBeUndefined();
  });

  it("seed1 済みの旧データには、レーズンだけ追加", () => {
    const d = { ...initialData(), seed1: 1 };
    const { data } = normalize(d);
    expect(data.prods.map((p) => p.name)).toEqual(["クッキー(見本)", "有機レーズンとカシューナッツ"]);
  });

  it("古い記録に予定を作ってひも付ける", () => {
    const d = initialData();
    d.events.push({ id: "e1", sid: "", date: "2026-01-02", name: "", fee: 0, visitors: 0, cash: 0, card: 0, emoney: 0, qr: 0, items: [] });
    const { data } = normalize(d);
    expect(data.sched).toHaveLength(1);
    expect(data.events[0].sid).toBe(data.sched[0].id);
    expect(data.sched[0].name).toBe("イベント");
  });
});

describe("変更の指示(Op)", () => {
  const d = initialData();

  it("項目を部分的に変える。元のデータは変わらない", () => {
    const r = applyOps(d, {}, [{ t: "patch", col: "mats", id: "m2", patch: { name: "発酵バター" } }]);
    expect(r.data.mats[1].name).toBe("発酵バター");
    expect(d.mats[1].name).toBe("バター");
    expect(r.data.mats[0]).toBe(d.mats[0]);
  });

  it("足し引きは差分で。小数の誤差を残さない", () => {
    const r = applyOps(d, {}, [
      { t: "incr", col: "mats", id: "m1", field: "qty", delta: -0.1 },
      { t: "incr", col: "mats", id: "m1", field: "qty", delta: -0.2 },
    ]);
    expect(r.data.mats[0].qty).toBe(2999.7);
  });

  it("追加・削除・設定・写真", () => {
    const r = applyOps(d, {}, [
      { t: "add", col: "base", item: { id: "b", month: "2026-01", sales: 1, orders: 1 } as never },
      { t: "del", col: "mats", id: "m4" },
      { t: "cfg", patch: { card: 2.5 } },
      { t: "tg", patch: { cost: 33 } },
      { t: "photo", id: "p1", value: "data:x" },
    ]);
    expect(r.data.base).toHaveLength(1);
    expect(r.data.mats).toHaveLength(3);
    expect(r.data.cfg.card).toBe(2.5);
    expect(r.data.cfg.tg).toMatchObject({ cost: 33, fee: 5 });
    expect(r.photos.p1).toBe("data:x");
    expect(applyOps(r.data, r.photos, [{ t: "photo", id: "p1", value: null }]).photos).toEqual({});
  });
});
