import { describe, expect, it } from "vitest";
import { matLookup } from "./calc";
import { applyEventStock, bake, bakeNeeds, buildEventItems, isLowMat, isLowProd, packIn, planNeeds } from "./stock";
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
    expect(produce(p, 10, "event", mat)).toEqual({ ok: true, used: { f: 200, g: 10, o: 10 }, pused: {}, stockAdd: 10 });
  });
  it("卸し用: 卸し用の資材を使い、在庫は増やさない", async () => {
    const { produce } = await import("./stock");
    expect(produce(p, 10, "whole", mat)).toEqual({ ok: true, used: { f: 200, g: 20 }, pused: {}, stockAdd: 0 });
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

describe("枠・トッピング・生地・詰め合わせ", () => {
  const M = (id: string, name: string, unit: string, price: number, qty = 10000): Material => ({ id, name, unit, packQty: 1000, packPrice: price, qty, min: 0 });
  const mats = [M("bt", "バター", "g", 2000), M("su", "砂糖", "g", 300), M("fl", "薄力粉", "g", 300), M("eg", "卵白", "g", 1000), M("cr", "生クリーム", "ml", 1500), M("cc", "クリームチーズ", "g", 2000)];
  const base = { extra: 0, stock: 0, min: 0, price: 0, whole: 0 };
  // サブレ生地: バター100 + 砂糖50 + 薄力粉150 = 300g、10枚分
  const sable: Product = { ...base, id: "sable", genre: "焼き菓子", name: "サブレ", yield: 10, stock: 40, lines: [{ m: "bt", qty: 100 }, { m: "su", qty: 50 }, { m: "fl", qty: 150 }] };
  const choco: Product = { ...base, id: "choco", genre: "焼き菓子", name: "ショコラ", yield: 10, stock: 3, lines: [{ m: "bt", qty: 100 }] };
  // くまサンタ: 自分の材料 + サブレ生地60g
  const kuma: Product = { ...base, id: "kuma", genre: "焼き菓子", name: "くまサンタ", yield: 6, lines: [{ m: "su", qty: 30 }, { m: "", d: "sable", qty: 60 }] };
  // ヴィジタンディーヌ: 本体 + メレンゲの枠
  const visi: Product = {
    ...base, id: "visi", genre: "焼き菓子", name: "ヴィジタンディーヌ", yield: 10,
    secs: [{ id: "mer", name: "メレンゲ" }],
    lines: [{ m: "bt", qty: 100 }, { m: "eg", qty: 50, sec: "mer" }, { m: "su", qty: 20, sec: "mer" }],
  };
  // キャロットケーキ: トッピング(チーズフロスティング)はオンにしたときだけ
  const carrot: Product = {
    ...base, id: "carrot", genre: "生菓子", name: "キャロットケーキ", yield: 8,
    secs: [{ id: "fr", name: "チーズフロスティング", opt: true }],
    lines: [{ m: "fl", qty: 160 }, { m: "cc", qty: 80, sec: "fr" }, { m: "cr", qty: 40, sec: "fr" }],
  };
  // BAKE BOX: サブレ4枚 + ショコラ2枚、1箱ずつ
  const box: Product = { ...base, id: "box", genre: "焼き菓子", name: "BAKE BOX", yield: 1, lines: [{ m: "", c: "sable", qty: 4 }, { m: "", c: "choco", qty: 2 }] };
  const all = [sable, choco, kuma, visi, carrot, box];

  it("生地の行は、元の材料の割合で原価になる(サブレ生地60g = 300gの1/5)", async () => {
    const { matLookup, batchCost, doughWeight } = await import("./calc");
    const mat = matLookup(mats, all);
    expect(doughWeight(sable, mat)).toBe(300);
    // サブレ1回分: 200 + 15 + 45 = 260円 → 60gは52円。砂糖30g = 9円
    expect(batchCost(kuma, mat)).toBeCloseTo(61);
  });

  it("生地の行は、作るときに元の材料を割合で使う", async () => {
    const { matLookup } = await import("./calc");
    const { produceNeeds } = await import("./stock");
    const n = produceNeeds(kuma, 12, "event", matLookup(mats, all));
    expect(n.map((x) => [x.group, x.mat.name, x.need])).toEqual([
      ["", "砂糖", 60],
      ["サブレの生地(120g)", "バター", 40],
      ["サブレの生地(120g)", "砂糖", 20],
      ["サブレの生地(120g)", "薄力粉", 60],
    ]);
  });

  it("メレンゲの枠は見出しつきで、いつも使う", async () => {
    const { matLookup, batchCost } = await import("./calc");
    const { produceNeeds } = await import("./stock");
    const mat = matLookup(mats, all);
    expect(produceNeeds(visi, 10, "event", mat).map((x) => [x.group, x.mat.name])).toEqual([["", "バター"], ["メレンゲ", "卵白"], ["メレンゲ", "砂糖"]]);
    expect(batchCost(visi, mat)).toBeCloseTo(200 + 50 + 6);
  });

  it("トッピングは原価に入れず、オンにしたときだけ使う", async () => {
    const { matLookup, productCost } = await import("./calc");
    const { produceNeeds } = await import("./stock");
    const mat = matLookup(mats, all);
    expect(productCost(carrot, mat).mat).toBeCloseTo(48 / 8);
    expect(produceNeeds(carrot, 8, "event", mat).map((x) => x.mat.name)).toEqual(["薄力粉"]);
    expect(produceNeeds(carrot, 8, "event", mat, new Set(["fr"])).map((x) => [x.group, x.mat.name])).toEqual([
      ["", "薄力粉"],
      ["チーズフロスティング", "クリームチーズ"],
      ["チーズフロスティング", "生クリーム"],
    ]);
  });

  it("詰め合わせ: 中のお菓子の材料原価が原価になり、作るとお菓子の在庫が減る。足りなければ実行しない", async () => {
    const { matLookup, productCost } = await import("./calc");
    const { produce } = await import("./stock");
    const mat = matLookup(mats, all);
    // サブレ 26円/枚 × 4 + ショコラ 20円/枚 × 2 = 144円
    expect(productCost(box, mat).mat).toBeCloseTo(144);
    expect(produce(box, 1, "event", mat)).toEqual({ ok: true, used: {}, pused: { sable: 4, choco: 2 }, stockAdd: 1 });
    expect(produce(box, 2, "event", mat)).toEqual({ ok: false, reason: "shortage", shortages: ["ショコラ"] });
  });

  it("自分の生地を使う輪になっても止まる", async () => {
    const { matLookup, batchCost } = await import("./calc");
    const loop: Product = { ...base, id: "loop", genre: "焼き菓子", name: "輪", yield: 1, dough: 100, lines: [{ m: "", d: "loop", qty: 50 }] };
    expect(batchCost(loop, matLookup(mats, [loop]))).toBe(0);
  });
});

describe("2枚セットで売る商品(販売の入数)", () => {
  const mats = [{ id: "f", name: "粉", unit: "g", packQty: 1000, packPrice: 1000, qty: 9999, min: 0 }];
  // 1回で10枚、材料費500円 → 1枚50円。袋(資材なしで、その他の包装代)20円/セット
  const p: Product = { id: "dia", genre: "焼き菓子", name: "ディアマン紫芋", yield: 10, extra: 20, stock: 30, min: 0, price: 300, whole: 120, pc: 2, lines: [{ m: "f", qty: 500 }] };

  it("原価はセットあたり(1枚の材料原価 × 入数 + 包装代)。卸しは1枚あたり", async () => {
    const { matLookup, productCost } = await import("./calc");
    const c = productCost(p, matLookup(mats));
    expect([c.mat, c.unit, c.pk, c.tot]).toEqual([50, 100, 20, 120]);
  });

  it("売れた数はセットで入れ、在庫は 入数 × セット数 だけ減る。取り消すと戻る", async () => {
    const { matLookup } = await import("./calc");
    const { buildEventItems, applyEventStock } = await import("./stock");
    const its = buildEventItems([p], { dia: { sold: 5, loss: 1 } }, matLookup(mats));
    expect(its[0]).toMatchObject({ sold: 5, loss: 1, out: 6, cost: 120, price: 300, pc: 2 });
    expect(applyEventStock([p], [], its)).toEqual({ dia: 18 });
    expect(applyEventStock([{ ...p, stock: 18 }], its, [])).toEqual({ dia: 30 });
  });
});

describe("グラムで売る商品(グラノーラ)", () => {
  const mats = [
    { id: "oat", name: "オートミール", unit: "g", packQty: 1000, packPrice: 800, qty: 9999, min: 0 },
    { id: "hon", name: "はちみつ", unit: "g", packQty: 1000, packPrice: 2000, qty: 9999, min: 0 },
  ];
  // 1回: オートミール 800g + はちみつ 200g = 1000g、材料費 640 + 400 = 1040円 → 1gあたり1.04円。1袋100g、袋代30円
  const g: Product = { id: "gr", genre: "グラノーラ", name: "ORIGINAL", yield: 0, extra: 30, stock: 0, min: 0, price: 800, whole: 0, gram: true, pc: 100, lines: [{ m: "oat", qty: 800 }, { m: "hon", qty: 200 }] };

  it("1回でできる量が空なら材料の重さ。原価は 1g × 1袋の重さ + 袋代", async () => {
    const { matLookup, productCost, yieldOf } = await import("./calc");
    const mat = matLookup(mats);
    expect(yieldOf(g, mat)).toBe(1000);
    const c = productCost(g, mat);
    expect(c.mat).toBeCloseTo(1.04);
    expect(c.tot).toBeCloseTo(104 + 30);
    // 焼いて軽くなった量を入れると、1gあたりは高くなる
    expect(productCost({ ...g, yield: 800 }, mat).mat).toBeCloseTo(1.3);
  });

  it("作る量(g)に応じて材料を使い、在庫はgで増える。売れた袋 × 重さ だけ減る", async () => {
    const { matLookup } = await import("./calc");
    const { produce, buildEventItems, applyEventStock } = await import("./stock");
    const mat = matLookup(mats);
    expect(produce(g, 500, "event", mat)).toEqual({ ok: true, used: { oat: 400, hon: 100 }, pused: {}, stockAdd: 500 });
    const its = buildEventItems([g], { gr: { sold: 3 } }, mat);
    expect(applyEventStock([{ ...g, stock: 500 }], [], its)).toEqual({ gr: 200 });
  });
});

describe("製造予定の材料の合計", () => {
  const p2: Product = { ...p, id: "p2", name: "クッキー", yield: 10, lines: [{ m: "m2", qty: 300 }] };
  it("同じ材料はまとめて、在庫より多ければ足りない", () => {
    const r = planNeeds(
      [
        { prod: "p1", qty: 40 },
        { prod: "p2", qty: 5 },
        { prod: "p2", qty: 5, done: true },
        { prod: "", qty: 10 },
        { prod: "p1", qty: 0 },
      ],
      [p, p2],
      mat,
    );
    expect(r.map((x) => [x.mat.name, x.need, x.short])).toEqual([
      ["薄力粉", 400, true],
      ["バター", 350, false],
    ]);
  });
});
