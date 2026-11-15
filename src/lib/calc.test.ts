import { describe, expect, it } from "vitest";
import {
  baseFee,
  batchCost,
  ceil10,
  costRate,
  eventReferenceSales,
  eventResult,
  matLookup,
  monthly,
  period,
  periodMonths,
  productCost,
  recommendedPrice,
  recommendedWhole,
  soldOf,
  targetProfitRate,
  unitCost,
} from "./calc";
import type { Config, EventRecord, Material, Product } from "./types";

const cfg: Config = {
  cash: 0,
  card: 3.25,
  emoney: 3.25,
  qr: 3.25,
  baseRate: 6.6,
  baseFix: 40,
  whole: 60,
  tg: { cost: 30, fee: 5, event: 10, rent: 20, fixed: 5 },
  rent: 30000,
  fixed: 5000,
};

const mats: Material[] = [
  { id: "m1", name: "薄力粉", unit: "g", packQty: 1000, packPrice: 280, qty: 3000, min: 1500 },
  { id: "m2", name: "バター", unit: "g", packQty: 450, packPrice: 900, qty: 600, min: 450 },
  { id: "m3", name: "砂糖", unit: "g", packQty: 1000, packPrice: 240, qty: 2500, min: 800 },
  { id: "m4", name: "卵", unit: "個", packQty: 10, packPrice: 280, qty: 12, min: 4 },
];
const mat = matLookup(mats);

const cookie: Product = {
  id: "p1",
  genre: "チャンククッキー",
  name: "クッキー(見本)",
  yield: 20,
  extra: 15,
  stock: 8,
  min: 10,
  price: 250,
  whole: 150,
  lines: [
    { m: "m1", qty: 200 },
    { m: "m2", qty: 100 },
    { m: "m3", qty: 80 },
    { m: "m4", qty: 1 },
  ],
};

function ev(over: Partial<EventRecord>): EventRecord {
  return {
    id: "e",
    sid: "s",
    date: "2026-05-10",
    name: "テスト",
    fee: 0,
    trans: 0,
    visitors: 0,
    cash: 0,
    card: 0,
    emoney: 0,
    qr: 0,
    items: [],
    ...over,
  };
}

describe("原価", () => {
  it("単位原価", () => {
    expect(unitCost(mats[1])).toBe(2);
    expect(unitCost({ packQty: 0, packPrice: 100 })).toBe(0);
  });

  it("1回分の材料費と1個あたり原価(見本のクッキー)", () => {
    // 200*0.28 + 100*2 + 80*0.24 + 1*28 = 56 + 200 + 19.2 + 28 = 303.2
    expect(batchCost(cookie, mat)).toBeCloseTo(303.2, 9);
    const c = productCost(cookie, mat);
    expect(c.mat).toBeCloseTo(15.16, 9);
    expect(c.pk).toBe(15);
    expect(c.tot).toBeCloseTo(30.16, 9);
  });

  it("消えた材料は0円、仕込み数0なら材料原価0", () => {
    expect(batchCost({ lines: [{ m: "none", qty: 10 }] }, mat)).toBe(0);
    expect(productCost({ ...cookie, yield: 0 }, mat)).toEqual({ mat: 0, unit: 0, pk: 15, tot: 15, wpk: 15, wtot: 15 });
  });
});

describe("推奨価格", () => {
  it("10円単位で切り上げ", () => {
    expect(recommendedPrice(30.16, 30)).toBe(110); // 100.53… → 110
    expect(recommendedPrice(75, 30)).toBe(250);
    expect(recommendedWhole(110, 60)).toBe(70); // 66 → 70
  });

  it("小数の誤差で1段上がらない(21円・35% は 60円)", () => {
    expect(recommendedPrice(21, 35)).toBe(60);
    expect(ceil10(60.00000000000001)).toBe(60);
    expect(ceil10(60.01)).toBe(70);
  });

  it("原価率", () => {
    expect(costRate(30, 100)).toBe(0.3);
    expect(costRate(30, 0)).toBeNull();
  });
});

describe("イベントの記録", () => {
  const e = ev({
    fee: 3000,
    trans: 1200,
    visitors: 40,
    cash: 10000,
    card: 8000,
    emoney: 2000,
    qr: 4000,
    items: [
      { id: "p1", name: "A", sold: 30, loss: 2, out: 32, cost: 100, price: 300 },
      { id: "p2", name: "B", loss: 1, out: 11, cost: 50, price: 400 }, // 旧データ(sold なし)
    ],
  });

  it("売上・手数料・原価・利益", () => {
    const r = eventResult(e, cfg);
    expect(r.sales).toBe(24000);
    expect(r.fees).toBeCloseTo(14000 * 0.0325, 9); // 455
    expect(r.cogs).toBe(32 * 100 + 11 * 50);
    expect(r.loss).toBe(3);
    expect(r.gross).toBe(24000 - 3750);
    expect(r.exp).toBe(4200);
    expect(r.net).toBeCloseTo(24000 - 3750 - 455 - 3000 - 1200, 9);
    expect(r.per).toBe(600);
  });

  it("来店0人なら客単価0、交通費なしは0扱い", () => {
    const r = eventResult(ev({ cash: 500, fee: 100, trans: undefined }), cfg);
    expect(r.per).toBe(0);
    expect(r.exp).toBe(100);
    expect(r.net).toBe(400);
  });

  it("売れた数と目安の売上", () => {
    expect(soldOf(e.items[0])).toBe(30);
    expect(soldOf(e.items[1])).toBe(10);
    expect(eventReferenceSales(e)).toBe(30 * 300 + 10 * 400);
  });
});

describe("BASE", () => {
  it("手数料 = 売上 × 率 + 注文数 × 固定額", () => {
    expect(baseFee({ sales: 50000, orders: 10 }, cfg)).toBeCloseTo(3300 + 400, 9);
  });
});

describe("月別と利益率カード", () => {
  const events = [
    ev({ date: "2026-03-01", cash: 10000, fee: 1000, items: [{ id: "a", name: "a", sold: 20, loss: 0, out: 20, cost: 150, price: 500 }] }),
    ev({ date: "2026-03-20", card: 10000, trans: 500 }),
    ev({ date: "2025-03-01", cash: 99999 }),
  ];
  const base = [
    { id: "b1", month: "2026-03", sales: 20000, orders: 5 },
    { id: "b2", month: "2026-07", sales: 10000, orders: 2 },
  ];

  it("月別の表", () => {
    const m = monthly(2026, events, base, cfg);
    expect(m[2].mk).toBe(20000);
    expect(m[2].sq).toBeCloseTo(325, 9);
    expect(m[2].base).toBe(20000);
    expect(m[2].bf).toBeCloseTo(1320 + 200, 9);
    expect(m[6].base).toBe(10000);
    expect(m[0]).toEqual({ mk: 0, base: 0, sq: 0, bf: 0, wh: 0 });
  });

  it("固定費の月数", () => {
    const now = new Date(2026, 10, 14); // 2026年11月
    expect(periodMonths(2026, 0, now)).toBe(11);
    expect(periodMonths(2025, 0, now)).toBe(12);
    expect(periodMonths(2027, 0, now)).toBe(0);
    expect(periodMonths(2027, 3, now)).toBe(1);
  });

  it("3月の利益率(BASEの原価はイベントの原価率で推計)", () => {
    const p = period(2026, 3, events, base, cfg, new Date(2026, 10, 14));
    // イベント売上 20000、原価 3000 → 原価率 0.15
    expect(p.sales).toBe(40000);
    expect(p.cost).toBeCloseTo(3000 + 20000 * 0.15, 9);
    expect(p.fee).toBeCloseTo(325 + 1320 + 200, 9);
    expect(p.ev).toBe(1500);
    expect(p.rent).toBe(30000);
    expect(p.fixed).toBe(5000);
    expect(p.profit).toBeCloseTo(40000 - 6000 - 1845 - 1500 - 30000 - 5000, 9);
  });

  it("イベント売上がない期間は希望の原価率で推計", () => {
    const p = period(2026, 7, events, base, cfg, new Date(2026, 10, 14));
    expect(p.cost).toBeCloseTo(10000 * 0.3, 9);
  });

  it("希望の利益率", () => {
    expect(targetProfitRate(cfg)).toBe(30);
  });
});

describe("BASEでの販売(1注文1個)", () => {
  const cfg = { baseRate: 6.6, baseFix: 40 };
  it("手数料・手取り・原価率・粗利", async () => {
    const { baseItem } = await import("./calc");
    // 500円: 手数料 = 500×6.6% + 40 = 73、手取り 427、原価150なら原価率30%、粗利277
    expect(baseItem(500, 150, cfg)).toEqual({ fee: 73, net: 427, rate: 30, profit: 277 });
  });
  it("価格がなければ計算しない", async () => {
    const { baseItem } = await import("./calc");
    expect(baseItem(0, 150, cfg)).toEqual({ fee: 0, net: 0, rate: null, profit: 0 });
  });
});

describe("雑貨(仕入れ値で原価)", () => {
  it("ルセットがなくても、仕入れ値が原価になる", async () => {
    const { productCost } = await import("./calc");
    expect(productCost({ lines: [], yield: 10, extra: 20, buy: 300 }, () => undefined)).toEqual({ mat: 300, unit: 300, pk: 20, tot: 320, wpk: 20, wtot: 320 });
    expect(productCost({ lines: [], yield: 10, extra: 0 }, () => undefined)).toEqual({ mat: 0, unit: 0, pk: 0, tot: 0, wpk: 0, wtot: 0 });
  });
});

describe("包装資材(出店用と卸し用)", () => {
  it("包装代 = その他 + 資材の単位原価 × 1個あたりの数。卸の原価は卸し用の資材で", async () => {
    const { productCost, packCost } = await import("./calc");
    const mats: Record<string, { id: string; packQty: number; packPrice: number }> = {
      gas: { id: "gas", packQty: 100, packPrice: 1200 }, // 12円/枚
      oxy: { id: "oxy", packQty: 100, packPrice: 800 }, // 8円/個
      box: { id: "box", packQty: 10, packPrice: 500 }, // 50円/箱
    };
    const mat = (id: string) => mats[id] as never;
    const p = {
      lines: [],
      yield: 10,
      extra: 5,
      packs: [{ m: "gas", qty: 1 }, { m: "oxy", qty: 1 }],
      wpacks: [{ m: "gas", qty: 1 }, { m: "box", qty: 0.1 }],
    };
    expect(packCost(p, mat)).toBe(25);
    expect(packCost(p, mat, "whole")).toBe(22);
    expect(productCost(p, mat)).toEqual({ mat: 0, unit: 0, pk: 25, tot: 25, wpk: 22, wtot: 22 });
    expect(packCost({ extra: 7 }, mat)).toBe(7);
  });
});

describe("卸し: ロットと納品", () => {
  const mats: Record<string, { id: string; packQty: number; packPrice: number }> = {
    gas: { id: "gas", packQty: 100, packPrice: 1000 }, // 10円/枚
    box: { id: "box", packQty: 10, packPrice: 1000 }, // 100円/箱
  };
  const mat = (id: string) => mats[id] as never;
  const p = { id: "p", lines: [], yield: 10, extra: 0, wlot: 20, wpacks: [{ m: "gas", qty: 1 }, { m: "box", qty: 1, per: "lot" as const }] };

  it("1ロットの枚数は 卸先 → 商品 → 1 の順", async () => {
    const { lotSize } = await import("./calc");
    expect(lotSize(p, { lots: { p: 50 } })).toBe(50);
    expect(lotSize(p, { lots: {} })).toBe(20);
    expect(lotSize({ id: "q" })).toBe(1);
  });

  it("1ロットあたりの資材は、ロットの枚数で割って1枚あたりにする", async () => {
    const { packCost } = await import("./calc");
    expect(packCost(p, mat, "whole")).toBe(15); // 10 + 100/20
    expect(packCost(p, mat, "whole", 50)).toBe(12); // 10 + 100/50
  });

  it("作るとき: 1枚あたりは枚数、1ロットあたりはロット数で使う", async () => {
    const { produceNeeds } = await import("./stock");
    const prod = { ...p, genre: "焼き菓子", name: "サブレ", stock: 0, min: 0, price: 0, whole: 0 };
    const m = (id: string) => ({ id, name: id, unit: "個", packQty: 1, packPrice: 0, qty: 999, min: 0 });
    const n = produceNeeds(prod, 60, "whole", m as never, undefined, 3);
    expect(n.map((x) => [x.mat.id, x.need])).toEqual([["gas", 60], ["box", 3]]);
  });

  it("納品は月別の表と利益率カードに入る(手数料なし)", async () => {
    const { monthly, period, wholeTotals } = await import("./calc");
    const w = [{ date: "2026-03-10", items: [{ prod: "p", name: "サブレ", lots: 2, lot: 20, qty: 40, price: 150, cost: 60 }] }];
    expect(wholeTotals(w[0])).toEqual({ sales: 6000, cost: 2400 });
    expect(monthly(2026, [], [], cfg, w as never)[2].wh).toBe(6000);
    const r = period(2026, 3, [], [], { ...cfg, rent: 0, fixed: 0 }, new Date(2026, 10, 14), w as never);
    expect([r.sales, r.cost, r.fee, r.profit]).toEqual([6000, 2400, 0, 3600]);
  });
});
