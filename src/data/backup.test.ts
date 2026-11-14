import { describe, expect, it } from "vitest";
import { makeBackup, parseBackup, summary } from "./backup";
import { initialData, normalize } from "./seed";

describe("書き出しと読み込み", () => {
  it("書き出したものを読み込むと、同じデータに戻る", () => {
    const { data, photos } = normalize(initialData());
    photos.p1 = "data:image/jpeg;base64,xxx";
    const text = JSON.stringify(makeBackup(data, photos, new Date("2026-11-14T00:00:00Z")));
    const r = parseBackup(text);
    expect(r.kind).toBe("v2");
    expect(r.data).toEqual(data);
    expect(r.photos).toEqual(photos);
  });

  it("旧アプリのデータ(S)を読める。足りない項目を補い、写真を名前で割り当てる", () => {
    const S = {
      cfg: { cash: 0, card: 3.25, emoney: 3.25, qr: 3.25, baseRate: 6.6, baseFix: 40, target: 28, whole: 60 },
      mats: [{ id: "a", name: "薄力粉", unit: "g", packQty: 1000, packPrice: 300, qty: 100, min: 0 }],
      prods: [
        { id: "x1", name: "チョコチャンククッキー", yield: 10, extra: 0, stock: 3, min: 0, price: 350, whole: 0, lines: [] },
        { id: "x2", name: "定番サブレ", yield: 10, extra: 0, stock: 3, min: 0, price: 300, whole: 0, lines: [] },
      ],
      events: [{ id: "e", date: "2026-05-01", name: "春のイベント", fee: 1000, visitors: 10, cash: 100, card: 0, emoney: 0, qr: 0, items: [] }],
      base: [],
      seed1: 1,
    };
    const r = parseBackup(JSON.stringify(S));
    expect(r.kind).toBe("legacy");
    expect(r.data.cfg.tg.cost).toBe(28);
    expect(r.data.prods.find((p) => p.id === "x2")!.genre).toBe("焼き菓子");
    expect(r.photos.x1).toBe("builtin:チョコチャンク");
    expect(r.photos.x2).toBeUndefined();
    expect(r.data.sched).toHaveLength(1);
    expect(r.data.events[0].sid).toBe(r.data.sched[0].id);
    // seed1 済みなので、レーズンだけ追加される
    expect(r.data.prods.map((p) => p.name)).toContain("有機レーズンとカシューナッツ");
    expect(summary(r.data)).toBe("材料1件、商品3件、出店予定1件、出店の記録1件、BASE0件");
  });

  it("読めないものは、理由つきで断る", () => {
    expect(() => parseBackup("abc")).toThrow("JSONとして読めません");
    expect(() => parseBackup('{"hello":1}')).toThrow("BAKE HUBのデータではない");
    expect(() => parseBackup('{"format":"bakehub","data":{}}')).toThrow("中身が足りません");
  });
});
