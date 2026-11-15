import { describe, expect, it } from "vitest";
import { matLookup } from "./calc";
import { applyEventStock, bake, bakeNeeds, buildEventItems, isLowMat, isLowProd, packIn } from "./stock";
import type { EventItem, Material, Product } from "./types";

const mats: Material[] = [
  { id: "m1", name: "薄力粉", unit: "g", packQty: 1000, packPrice: 280, qty: 300, min: 1500 },
  { id: "m2", name: "バター", unit: "g", packQty: 450, packPrice: 900, qty: 600, min: 450 },
];
const mat = matLookup(mats);

const p: Product = {
  id: "p1",
  genre: "焼き菓子",
  name: "サブレ",
  yield: 20,
  extra: 10,
  stock: 5,
  min: 10,
  price: 200,
  whole: 120,
  lines: [
    { m: "m1", qty: 200 },
    { m: "m2", qty: 100 },
  ],
};

describe("材料", () => {
  it("＋1パック入庫", () => {
    expect(packIn(mats[0])).toBe(1300);
  });
});

describe("作成して在庫を更新", () => {
  it("必要量は 使用量 × 作る数 / 仕込み数", () => {
    const n = bakeNeeds(p, 30, mat);
    expect(n.map((x) => [x.mat.id, x.need, x.short])).toEqual([
      ["m1", 300, false],
      ["m2", 150, false],
    ]);
    expect(bakeNeeds(p, 40, mat)[0].short).toBe(true);
  });

  it("材料を減らし、完成品を増やす", () => {
    const r = bake(p, 30, mat);
    expect(r).toEqual({ ok: true, matQty: { m1: 0, m2: 450 }, stock: 35 });
  });

  it("足りなければ実行しない", () => {
    expect(bake(p, 40, mat)).toEqual({ ok: false, reason: "shortage", shortages: ["薄力粉"] });
  });

  it("作る数が0なら実行しない", () => {
    expect(bake(p, 0, mat)).toEqual({ ok: false, reason: "no-count" });
  });

  it("同じ材料が2行あれば、両方の分を引く", () => {
    const q = { ...p, lines: [{ m: "m2", qty: 100 }, { m: "m2", qty: 50 }] };
    const r = bake(q, 20, mat);
    expect(r.ok && r.matQty.m2).toBe(450);
  });
});

describe("イベントの記録と在庫", () => {
  const prods: Product[] = [p, { ...p, id: "p2", name: "マドレーヌ", stock: 3, price: 300 }];

  it("入力から items を作る(記録時の原価と価格を残す)", () => {
    const its = buildEventItems(prods, { p1: { sold: 4, loss: 1 }, p2: { sold: 0, loss: 0 } }, mat);
    expect(its).toHaveLength(1);
    expect(its[0]).toMatchObject({ id: "p1", name: "サブレ", sold: 4, loss: 1, out: 5, price: 200 });
    // (200*0.28 + 100*2)/20 + 10 = 22.8
    expect(its[0].cost).toBeCloseTo(22.8, 9);
  });

  const item = (id: string, out: number): EventItem => ({ id, name: id, sold: out, loss: 0, out, cost: 0, price: 0 });

  it("保存: 売れた数 + ロス数を引く(0未満にしない)", () => {
    expect(applyEventStock(prods, [], [item("p1", 2), item("p2", 9)])).toEqual({ p1: 3, p2: 0 });
  });

  it("再編集: 古い分を戻してから新しい分を引く", () => {
    // p1 の在庫 5 は、前回 2 個引かれたあとの数
    expect(applyEventStock(prods, [item("p1", 2)], [item("p1", 4)])).toEqual({ p1: 3 });
  });

  it("削除: 在庫を戻す。消えた商品は無視", () => {
    expect(applyEventStock(prods, [item("p1", 2), item("gone", 5)], [])).toEqual({ p1: 7 });
  });
});

describe("お知らせ", () => {
  it("材料は qty <= min", () => {
    expect(isLowMat(mats[0])).toBe(true);
    expect(isLowMat({ ...mats[1], qty: 451 })).toBe(false);
    expect(isLowMat({ ...mats[1], qty: 450 })).toBe(true);
  });

  it("商品は min > 0 かつ stock <= min", () => {
    expect(isLowProd(p)).toBe(true);
    expect(isLowProd({ ...p, min: 0, stock: 0 })).toBe(false);
  });
});

describe("作成を記録(材料と包装資材)", () => {
  const mats: Record<string, Material> = {
    f: { id: "f", name: "薄力粉", unit: "g", packQty: 1000, packPrice: 300, qty: 1000, min: 0 },
    g: { id: "g", name: "ガス袋", unit: "枚", packQty: 100, packPrice: 1200, qty: 50, min: 0 },
    o: { id: "o", name: "脱酸素剤", unit: "個", packQty: 100, packPrice: 800, qty: 10, min: 0 },
  };
  const mat = (id: string) => mats[id];
  const p: Product = {
    id: "p",
    genre: "焼き菓子",
    name: "サブレ",
    yield: 20,
    extra: 0,
    stock: 3,
    min: 0,
    price: 300,
    whole: 180,
    lines: [{ m: "f", qty: 400 }],
    packs: [{ m: "g", qty: 1 }, { m: "o", qty: 1 }],
    wpacks: [{ m: "g", qty: 2 }],
  };

  it("出店用: 材料と出店用の資材を減らし、在庫を増やす", async () => {
    const { produce } = await import("./stock");
    expect(produce(p, 10, "event", mat)).toEqual({ ok: true, used: { f: 200, g: 10, o: 10 }, stockAdd: 10 });
  });
  it("卸し用: 卸し用の資材を使い、在庫は増やさない", async () => {
    const { produce } = await import("./stock");
    expect(produce(p, 10, "whole", mat)).toEqual({ ok: true, used: { f: 200, g: 20 }, stockAdd: 0 });
  });
  it("包装資材が足りなければ実行しない", async () => {
    const { produce, produceNeeds } = await import("./stock");
    expect(produce(p, 20, "event", mat)).toEqual({ ok: false, reason: "shortage", shortages: ["脱酸素剤"] });
    expect(produceNeeds(p, 20, "event", mat).map((x) => [x.mat.name, x.kind, x.short])).toEqual([
      ["薄力粉", "recipe", false],
      ["ガス袋", "pack", false],
      ["脱酸素剤", "pack", true],
    ]);
  });
  it("作る数が0なら実行しない", async () => {
    const { produce } = await import("./stock");
    expect(produce(p, 0, "event", mat)).toEqual({ ok: false, reason: "no-count" });
  });
});

describe("製造記録の保存と取り消し", () => {
  it("記録で減らした分を、消すとそのまま戻す", async () => {
    const { bakeOps, undoBakeOps } = await import("../data/bakes");
    const b = { id: "b1", date: "2026-11-15", prod: "p", name: "サブレ", qty: 10, use: "event" as const, used: { f: 200, g: 10 }, stockAdd: 10, plan: "pl" };
    expect(bakeOps(b)).toEqual([
      { t: "incr", col: "mats", id: "f", field: "qty", delta: -200 },
      { t: "incr", col: "mats", id: "g", field: "qty", delta: -10 },
      { t: "incr", col: "prods", id: "p", field: "stock", delta: 10 },
      { t: "add", col: "bakes", item: b, first: true },
      { t: "patch", col: "plans", id: "pl", patch: { done: true } },
    ]);
    expect(undoBakeOps(b, { mats: new Set(["f"]), prods: new Set(["p"]) })).toEqual([
      { t: "incr", col: "mats", id: "f", field: "qty", delta: 200 },
      { t: "incr", col: "prods", id: "p", field: "stock", delta: -10 },
      { t: "del", col: "bakes", id: "b1" },
    ]);
  });
});
