// 現行の bake-hub.single-file.html のプログラムをそのまま読み込み、
// ランダムなデータで、新しい計算と結果が同じになるかを確かめる。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  eventResult,
  matLookup,
  monthly,
  period,
  productCost,
  recommendedPrice,
  recommendedWhole,
  targetCostRate,
} from "./calc";
import { applyEventStock, bake, buildEventItems } from "./stock";
import type { AppData, Config, EventRecord, Material, Product } from "./types";

const HTML = fileURLToPath(new URL("../../bake-hub.single-file.html", import.meta.url));

// ---- 旧プログラムを動かすための、最小限のブラウザのまね ----
function el(): any {
  return {
    innerHTML: "",
    textContent: "",
    className: "",
    style: {},
    dataset: {},
    setAttribute() {},
    remove() {},
    appendChild() {},
    animate() {},
    get firstChild() {
      return el();
    },
  };
}

interface Legacy {
  ctx: any;
  click: (dataset: Record<string, string>) => void;
}

function loadLegacy(): Legacy {
  const html = readFileSync(HTML, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const handlers: Record<string, (ev: any) => void> = {};
  const elements: Record<string, any> = {};
  const ctx: any = {
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      querySelector: (s: string) => (elements[s] ??= el()),
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener: (t: string, f: (ev: any) => void) => (handlers[t] = f),
      body: el(),
      activeElement: null,
      hidden: false,
    },
    matchMedia: () => ({ matches: true }),
    setTimeout: () => 0,
    clearTimeout() {},
    window: {},
    Event: class {},
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of scripts) vm.runInContext(s, ctx);
  const click = (dataset: Record<string, string>) =>
    handlers.click({ target: { closest: () => ({ dataset }) } });
  return { ctx, click };
}

// ---- 決まった順で出る乱数(毎回同じデータになる) ----
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function makeData(seed: number): AppData {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const cfg: Config = {
    cash: pick([0, 0, 1]),
    card: pick([3.25, 2.5, 3.6]),
    emoney: pick([3.25, 3.0]),
    qr: pick([3.25, 2.95]),
    baseRate: pick([6.6, 3.6]),
    baseFix: pick([40, 0]),
    whole: pick([60, 65, 70]),
    tg: { cost: pick([30, 35, 28, 33]), fee: 5, event: 10, rent: 20, fixed: 5 },
    rent: int(0, 50000),
    fixed: int(0, 10000),
  };
  const mats: Material[] = Array.from({ length: int(3, 8) }, (_, i) => {
    const packQty = pick([1, 10, 450, 500, 1000, 2500]);
    return {
      id: "m" + i,
      name: "材料" + i,
      unit: "g",
      packQty,
      packPrice: int(50, 3000),
      qty: int(0, 5) * packQty + int(0, 100),
      min: int(0, 2) * packQty,
    };
  });
  const prods: Product[] = Array.from({ length: int(2, 6) }, (_, i) => ({
    id: "p" + i,
    genre: "焼き菓子",
    name: "商品" + i,
    yield: pick([0, 6, 10, 12, 20, 24]),
    extra: pick([0, 5, 12.5, 30]),
    stock: int(0, 40),
    min: int(0, 10),
    price: pick([0, 250, 300, 380, 450]),
    whole: pick([0, 150, 200]),
    lines: Array.from({ length: int(0, 4) }, () => ({ m: pick(mats).id, qty: pick([1, 15, 80, 200, 333.3]) })),
  }));
  const sched = Array.from({ length: int(1, 6) }, (_, i) => ({
    id: "s" + i,
    date: `${pick([2025, 2026])}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    name: "イベント" + i,
    place: "",
    start: "10:00",
    end: "16:00",
  }));
  const events: EventRecord[] = sched.slice(0, int(0, sched.length)).map((s, i) => ({
    id: "e" + i,
    sid: s.id,
    date: s.date,
    name: s.name,
    fee: int(0, 8000),
    trans: pick([0, 800, undefined as unknown as number]),
    visitors: int(0, 80),
    cash: int(0, 60000),
    card: int(0, 40000),
    emoney: int(0, 10000),
    qr: int(0, 20000),
    memo: "",
    items: prods
      .filter(() => r() < 0.6)
      .map((p) => {
        const sold = int(0, 20);
        const loss = int(0, 3);
        return { id: p.id, name: p.name, sold, loss, out: sold + loss, cost: r() * 150, price: p.price };
      }),
  }));
  const base = Array.from({ length: int(0, 5) }, (_, i) => ({
    id: "b" + i,
    month: `${pick([2025, 2026])}-${String(int(1, 12)).padStart(2, "0")}`,
    sales: int(0, 200000),
    orders: int(0, 40),
  }));
  return { cfg, mats, prods, sched, events, base, plans: [], seed1: 1, seed2: 1 };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

let L: Legacy;
beforeAll(() => {
  L = loadLegacy();
});

function useData(d: AppData) {
  L.ctx.S = clone(d);
  L.ctx.armed = null;
  L.ctx.RN = {};
}

describe("現行HTMLとの照合", () => {
  it("旧プログラムを読み込める", () => {
    expect(typeof L.ctx.evCalc).toBe("function");
    expect(L.ctx.S.mats.length).toBeGreaterThan(0);
  });

  it.each(SEEDS)("商品の原価(データ%i)", (seed) => {
    const d = makeData(seed);
    useData(d);
    const mat = matLookup(d.mats);
    for (const p of d.prods) {
      const old = L.ctx.pc(L.ctx.prod(p.id));
      const now = productCost(p, mat);
      expect(now.mat).toBeCloseTo(old.mat, 9);
      expect(now.tot).toBeCloseTo(old.tot, 9);
    }
  });

  it.each(SEEDS)("推奨価格(データ%i)。違うのは小数の誤差の修正だけ", (seed) => {
    const d = makeData(seed);
    useData(d);
    const mat = matLookup(d.mats);
    for (const p of d.prods) {
      L.ctx.prSel = p.id;
      const h: string = L.ctx.vProdDetail();
      const yenOf = (label: string) =>
        +(h.match(new RegExp(label + "[^<]*</span><b>¥([\\d,]+)"))![1].replace(/,/g, ""));
      const tot = productCost(p, mat).tot;
      const t = targetCostRate(d.cfg);
      const rec = recommendedPrice(tot, t);
      const oldRec = yenOf("推奨販売価格");
      if (rec !== oldRec) {
        // 旧版は誤差で10円上がる場合がある。そのときだけ違ってよい
        expect(oldRec).toBe(rec + 10);
        expect(Number.isInteger(Math.round((tot / (t / 100)) * 1e6) / 1e6 / 10)).toBe(true);
      } else {
        expect(recommendedWhole(rec, d.cfg.whole)).toBe(yenOf("推奨卸価格"));
      }
    }
  });

  it.each(SEEDS)("イベントの結果(データ%i)", (seed) => {
    const d = makeData(seed);
    useData(d);
    for (const e of d.events) {
      const old = L.ctx.evCalc(L.ctx.S.events.find((x: EventRecord) => x.id === e.id));
      const now = eventResult(e, d.cfg);
      for (const k of ["sales", "fees", "cogs", "loss", "gross", "exp", "net", "per"] as const) {
        expect(now[k]).toBeCloseTo(old[k], 6);
      }
    }
  });

  it.each(SEEDS)("月別の表と利益率カード(データ%i)", (seed) => {
    const d = makeData(seed);
    useData(d);
    const now = new Date();
    for (const y of [2025, 2026]) {
      const old = L.ctx.monthly(y);
      const cur = monthly(y, d.events, d.base, d.cfg);
      cur.forEach((m, i) => {
        for (const k of ["mk", "base", "sq", "bf"] as const) expect(m[k]).toBeCloseTo(old[i][k], 6);
      });
      for (const pm of [0, 1, 3, 6, 11, 12]) {
        L.ctx.YR = y;
        L.ctx.PM = pm;
        const o = L.ctx.period();
        const n = period(y, pm, d.events, d.base, d.cfg, now);
        for (const k of ["sales", "cost", "fee", "ev", "rent", "fixed", "profit"] as const) {
          expect(n[k]).toBeCloseTo(o[k], 6);
        }
      }
    }
  });

  it.each(SEEDS)("作成して在庫を更新(データ%i)", (seed) => {
    const d = makeData(seed);
    const mat = matLookup(d.mats);
    for (const p of d.prods) {
      for (const n of [0, 5, p.yield, p.yield * 3]) {
        useData(d);
        L.ctx.RN[p.id] = n;
        L.click({ a: "bake", id: p.id });
        const r = bake(p, n, mat);
        const oldMats: Material[] = L.ctx.S.mats;
        const oldProd: Product = L.ctx.prod(p.id);
        if (r.ok) {
          expect(oldProd.stock).toBe(r.stock);
          for (const m of oldMats) expect(m.qty).toBe(r.matQty[m.id] ?? m.qty);
        } else {
          expect(oldProd.stock).toBe(p.stock);
          expect(oldMats).toEqual(d.mats);
        }
      }
    }
  });

  it.each(SEEDS)("イベント記録の保存・再編集・削除と在庫(データ%i)", (seed) => {
    const d = makeData(seed);
    const r = rng(seed * 7);
    const mat = matLookup(d.mats);
    for (const s of d.sched) {
      useData(d);
      const draft: Record<string, { sold?: number; loss?: number }> = {};
      for (const p of d.prods) if (r() < 0.7) draft[p.id] = { sold: Math.floor(r() * 30), loss: Math.floor(r() * 3) };
      L.ctx.evSel = s.id;
      L.ctx.D = { visitors: 10, fee: 1000, trans: 0, cash: 5000, card: 0, emoney: 0, qr: 0, memo: "", items: clone(draft) };
      L.click({ a: "saveev" });

      const oldItems = d.events.find((e) => e.sid === s.id)?.items ?? [];
      const newItems = buildEventItems(d.prods, draft, mat);
      const saved = L.ctx.S.events.find((e: EventRecord) => e.sid === s.id);
      expect(saved.items.map((i: any) => [i.id, i.sold, i.loss, i.out, i.price])).toEqual(
        newItems.map((i) => [i.id, i.sold, i.loss, i.out, i.price]),
      );
      saved.items.forEach((i: any, k: number) => expect(newItems[k].cost).toBeCloseTo(i.cost, 9));

      const after = applyEventStock(d.prods, oldItems, newItems);
      for (const p of d.prods) expect(L.ctx.prod(p.id).stock).toBe(after[p.id] ?? p.stock);

      // 続けて削除すると在庫が戻る
      const before: Product[] = clone(L.ctx.S.prods);
      L.click({ a: "delevent", id: s.id });
      L.click({ a: "delevent", id: s.id });
      const back = applyEventStock(before, newItems, []);
      for (const p of before) expect(L.ctx.prod(p.id).stock).toBe(back[p.id] ?? p.stock);
    }
  });
});
