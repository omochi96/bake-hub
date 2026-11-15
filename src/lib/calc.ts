// 計算式(SPEC.md 4章)。画面から切り離した、入力だけで結果が決まる関数。
import type { BakeUse, BaseRecord, Config, EventRecord, Material, Product } from "./types";

/** 小数の計算誤差を除く(小数第6位で丸める) */
export function clean(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** 10円単位で切り上げ */
export function ceil10(x: number): number {
  return Math.ceil(clean(x / 10)) * 10;
}

/** 単位原価 = packPrice / packQty */
export function unitCost(m: Pick<Material, "packQty" | "packPrice">): number {
  return m.packQty ? m.packPrice / m.packQty : 0;
}

export type MatLookup = (id: string) => Material | undefined;

export function matLookup(mats: Material[]): MatLookup {
  const map = new Map(mats.map((m) => [m.id, m]));
  return (id) => map.get(id);
}

/** 1回分の材料費 = Σ(単位原価 × 使用量)。見つからない材料は0円 */
export function batchCost(p: Pick<Product, "lines">, mat: MatLookup): number {
  return p.lines.reduce((a, l) => {
    const m = mat(l.m);
    return a + (m ? unitCost(m) * l.qty : 0);
  }, 0);
}

export interface ProductCost {
  /** 材料原価/個 */
  mat: number;
  /** 包装代 */
  pk: number;
  /** 包装代込み原価 */
  tot: number;
  /** 包装代(卸し用) */
  wpk: number;
  /** 卸し用の原価(材料原価 + 卸し用の包装代) */
  wtot: number;
}

/** 包装代/個 = その他(extra) + Σ(包装資材の単位原価 × 1個あたりの数)。use で出店用か卸し用かを選ぶ */
export function packCost(p: Pick<Product, "extra" | "packs" | "wpacks">, mat: MatLookup, use: BakeUse = "event"): number {
  const ls = (use === "whole" ? p.wpacks : p.packs) ?? [];
  return clean((p.extra || 0) + batchCost({ lines: ls }, mat));
}

/**
 * 材料原価/個 = ルセットの材料費 / 仕込み数 + 仕入れ値(雑貨)
 * 包装代込み原価 = 材料原価/個 + 包装代(出店用)。卸し用の原価 wtot は卸し用の包装資材で計算
 */
export function productCost(p: Pick<Product, "lines" | "yield" | "extra" | "buy" | "packs" | "wpacks">, mat: MatLookup): ProductCost {
  const m = (p.yield ? batchCost(p, mat) / p.yield : 0) + (p.buy ?? 0);
  const pk = packCost(p, mat, "event");
  const wpk = packCost(p, mat, "whole");
  return { mat: m, pk, tot: m + pk, wpk, wtot: m + wpk };
}

/** 目標原価率(%)。未設定なら30 */
export function targetCostRate(cfg: Config): number {
  return cfg.tg.cost || 30;
}

/** 推奨販売価格 = ceil(包装代込み原価 / (目標原価率/100) / 10) * 10 */
export function recommendedPrice(totalCost: number, targetRatePct: number): number {
  return ceil10(totalCost / (targetRatePct / 100));
}

/** 推奨卸価格 = ceil(推奨販売価格 * 掛け率/100 / 10) * 10 */
export function recommendedWhole(recPrice: number, wholeRatePct: number): number {
  return ceil10((recPrice * wholeRatePct) / 100);
}

/** 原価率(0〜1)。価格が0なら null */
export function costRate(cost: number, price: number): number | null {
  return price ? cost / price : null;
}

// ---- イベント ----

/** 売れた数(旧データで sold がない場合は out − loss) */
export function soldOf(i: { sold?: number; out: number; loss: number }): number {
  return i.sold != null ? i.sold : Math.max(0, i.out - i.loss);
}

export interface EventResult {
  sales: number;
  fees: number;
  cogs: number;
  loss: number;
  gross: number;
  /** 出店料 + 交通費 */
  exp: number;
  /** 差引利益 */
  net: number;
  /** 客単価 */
  per: number;
}

export function squareFees(e: Pick<EventRecord, "cash" | "card" | "emoney" | "qr">, cfg: Config): number {
  return (
    (e.cash * cfg.cash) / 100 + (e.card * cfg.card) / 100 + (e.emoney * cfg.emoney) / 100 + (e.qr * cfg.qr) / 100
  );
}

export function eventResult(e: EventRecord, cfg: Config): EventResult {
  const sales = e.cash + e.card + e.emoney + e.qr;
  const fees = squareFees(e, cfg);
  const cogs = e.items.reduce((a, i) => a + i.out * i.cost, 0);
  const loss = e.items.reduce((a, i) => a + i.loss, 0);
  const gross = sales - cogs;
  const trans = e.trans || 0;
  return {
    sales,
    fees,
    cogs,
    loss,
    gross,
    exp: e.fee + trans,
    net: gross - fees - e.fee - trans,
    per: e.visitors ? sales / e.visitors : 0,
  };
}

/** 販売価格で計算した目安の売上 */
export function eventReferenceSales(e: EventRecord): number {
  return e.items.reduce((a, i) => a + soldOf(i) * (i.price || 0), 0);
}

// ---- BASE ----

export function baseFee(b: Pick<BaseRecord, "sales" | "orders">, cfg: Config): number {
  return (b.sales * cfg.baseRate) / 100 + b.orders * cfg.baseFix;
}

export interface BaseItem {
  /** BASE手数料/個 */
  fee: number;
  /** 手取り/個 */
  net: number;
  /** 原価率(%)。価格がなければ null */
  rate: number | null;
  /** 粗利/個 */
  profit: number;
}

/** 商品をBASEで1個売ったとき(1注文1個として計算) */
export function baseItem(basePrice: number, totalCost: number, cfg: Pick<Config, "baseRate" | "baseFix">): BaseItem {
  if (!basePrice) return { fee: 0, net: 0, rate: null, profit: 0 };
  const fee = clean((basePrice * cfg.baseRate) / 100 + cfg.baseFix);
  const net = clean(basePrice - fee);
  return { fee, net, rate: clean((totalCost / basePrice) * 100), profit: clean(net - totalCost) };
}

// ---- 月別 ----

export interface MonthRow {
  /** イベント売上 */
  mk: number;
  /** BASE売上 */
  base: number;
  /** Squareの手数料 */
  sq: number;
  /** BASEの手数料 */
  bf: number;
}

export function monthly(year: number, events: EventRecord[], base: BaseRecord[], cfg: Config): MonthRow[] {
  const r: MonthRow[] = Array.from({ length: 12 }, () => ({ mk: 0, base: 0, sq: 0, bf: 0 }));
  for (const e of events) {
    if (+e.date.slice(0, 4) !== year) continue;
    const c = eventResult(e, cfg);
    const m = r[+e.date.slice(5, 7) - 1];
    m.mk += c.sales;
    m.sq += c.fees;
  }
  for (const b of base) {
    if (+b.month.slice(0, 4) !== year) continue;
    const m = r[+b.month.slice(5, 7) - 1];
    m.base += b.sales;
    m.bf += baseFee(b, cfg);
  }
  return r;
}

// ---- 利益率カード ----

export interface PeriodResult {
  sales: number;
  cost: number;
  fee: number;
  /** 出店料・交通費 */
  ev: number;
  rent: number;
  fixed: number;
  profit: number;
}

/** 固定費の月数。月選択なら1、年間なら今年は今月まで、過去年は12、未来年は0 */
export function periodMonths(year: number, month: number, now: Date): number {
  if (month) return 1;
  const y = now.getFullYear();
  if (year === y) return now.getMonth() + 1;
  return year < y ? 12 : 0;
}

/** month = 0 は年間、1〜12 はその月 */
export function period(
  year: number,
  month: number,
  events: EventRecord[],
  base: BaseRecord[],
  cfg: Config,
  now: Date,
): PeriodResult {
  const inP = (d: string) => +d.slice(0, 4) === year && (!month || +d.slice(5, 7) === month);
  const o = { sales: 0, cost: 0, fee: 0, ev: 0, rent: 0, fixed: 0, profit: 0 };
  let es = 0;
  let ec = 0;
  for (const e of events) {
    if (!inP(e.date)) continue;
    const c = eventResult(e, cfg);
    o.sales += c.sales;
    es += c.sales;
    ec += c.cogs;
    o.cost += c.cogs;
    o.fee += c.fees;
    o.ev += e.fee + (e.trans || 0);
  }
  const rr = es > 0 ? ec / es : (cfg.tg.cost || 0) / 100;
  for (const b of base) {
    if (!inP(b.month)) continue;
    o.sales += b.sales;
    o.fee += baseFee(b, cfg);
    o.cost += b.sales * rr;
  }
  const mo = periodMonths(year, month, now);
  o.rent = cfg.rent * mo;
  o.fixed = cfg.fixed * mo;
  o.profit = o.sales - o.cost - o.fee - o.ev - o.rent - o.fixed;
  return o;
}

/** 希望の利益率(%) = 100 − 他の希望配分 */
export function targetProfitRate(cfg: Config): number {
  const t = cfg.tg;
  return 100 - t.cost - t.fee - t.event - t.rent - t.fixed;
}
