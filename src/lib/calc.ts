// 計算式(SPEC.md 4章)。画面から切り離した、入力だけで結果が決まる関数。
import type { BakeUse, BaseRecord, Client, Config, EventRecord, Material, Product, RecipeLine, WholeSale } from "./types";

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

/** 材料を探す。prod があれば、生地やお菓子の行で使う商品も探せる */
export type MatLookup = ((id: string) => Material | undefined) & { prod?: (id: string) => Product | undefined };

export function matLookup(mats: Material[], prods?: Product[]): MatLookup {
  const map = new Map(mats.map((m) => [m.id, m]));
  const f: MatLookup = (id) => map.get(id);
  if (prods) {
    const pm = new Map(prods.map((p) => [p.id, p]));
    f.prod = (id) => pm.get(id);
  }
  return f;
}

/** 生地やお菓子の行をたどる深さの上限(自分を含む輪になっても止まるように) */
const MAX_DEPTH = 3;

type LineOwner = Pick<Product, "lines"> & Partial<Pick<Product, "secs">>;

/** トッピングの枠か */
export function isTopping(p: Partial<Pick<Product, "secs">>, sec?: string): boolean {
  return !!sec && !!p.secs?.find((s) => s.id === sec)?.opt;
}

/** 使う行。トッピングの枠は、on に入っているものだけ */
export function activeLines(p: LineOwner, on?: ReadonlySet<string>): RecipeLine[] {
  return p.lines.filter((l) => !isTopping(p, l.sec) || !!on?.has(l.sec!));
}

/** 1回分の生地の重さ(g)。dough があればそれ、なければトッピング以外の g・ml の材料と生地の行の合計 */
export function doughWeight(p: Pick<Product, "lines"> & Partial<Pick<Product, "secs" | "dough">>, mat: MatLookup): number {
  if (p.dough) return p.dough;
  let w = 0;
  for (const l of activeLines(p)) {
    if (l.d) w += l.qty;
    else if (!l.c) {
      const m = mat(l.m);
      if (m && /^(g|ml|グラム)$/i.test(m.unit.trim())) w += l.qty;
    }
  }
  return w;
}

/** 生地1gあたりの材料費 */
export function doughCostPerGram(p: Product, mat: MatLookup, depth = 0): number {
  const w = doughWeight(p, mat);
  return w ? batchCost(p, mat, undefined, depth) / w : 0;
}

/**
 * 1回の仕込み数(できる数)。グラムで売る商品で0なら、生地の重さ(g)を使う
 */
export function yieldOf(p: Pick<Product, "yield" | "lines"> & Partial<Pick<Product, "gram" | "secs" | "dough">>, mat: MatLookup): number {
  if (p.yield) return p.yield;
  return p.gram ? doughWeight(p, mat) : 0;
}

/** 単位の言葉(1枚 / 1g) */
export function pieceWord(p: Partial<Pick<Product, "gram">>): string {
  return p.gram ? "g" : "枚";
}

/** 売るときのまとまりの名前(「100g入り」「2枚セット」。1個ずつなら "") */
export function saleLabel(p: Partial<Pick<Product, "pc" | "gram">>): string {
  const n = p.pc && p.pc > 0 ? p.pc : 1;
  if (p.gram) return `${Math.round(n * 10) / 10}g入り`;
  return n > 1 ? `${n}枚セット` : "";
}

/** 在庫の表示(「1200g(12袋)」「30枚(15セット)」「30」) */
export function stockText(p: Pick<Product, "stock"> & Partial<Pick<Product, "pc" | "gram">>): string {
  const n = p.pc && p.pc > 0 ? p.pc : 1;
  const s = p.stock.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  if (p.gram) return n > 1 ? `${s}g(${Math.floor(p.stock / n)}袋)` : `${s}g`;
  return n > 1 ? `${s}枚(${Math.floor(p.stock / n)}セット)` : s;
}

/** お菓子1個あたりの材料原価(詰め合わせの行で使う) */
function pieceCost(p: Product, mat: MatLookup, depth: number): number {
  const y = yieldOf(p, mat);
  return (y ? batchCost(p, mat, undefined, depth) / y : 0) + (p.buy ?? 0);
}

/** 行の原価。材料: 単位原価 × 使用量、生地: 生地1gの材料費 × g、お菓子: 材料原価/個 × 枚数 */
export function lineCost(l: RecipeLine, mat: MatLookup, depth = 0): number {
  if (l.d || l.c) {
    const q = mat.prod?.((l.d || l.c)!);
    if (!q || depth >= MAX_DEPTH) return 0;
    return (l.d ? doughCostPerGram(q, mat, depth + 1) : pieceCost(q, mat, depth + 1)) * l.qty;
  }
  const m = mat(l.m);
  return m ? unitCost(m) * l.qty : 0;
}

/** 1回分の材料費 = Σ(行の原価)。見つからない材料は0円。トッピングの枠は on に入っているものだけ */
export function batchCost(p: LineOwner, mat: MatLookup, on?: ReadonlySet<string>, depth = 0): number {
  return activeLines(p, on).reduce((a, l) => a + lineCost(l, mat, depth), 0);
}

export interface ProductCost {
  /** 材料原価/個(1枚) */
  mat: number;
  /** 材料原価/販売単位(1枚 × 入数) */
  unit: number;
  /** 包装代 */
  pk: number;
  /** 包装代込み原価(販売単位あたり) */
  tot: number;
  /** 包装代(卸し用) */
  wpk: number;
  /** 卸し用の原価(材料原価 + 卸し用の包装代) */
  wtot: number;
}

/** 1ロットの枚数 = 卸先の指定 → 商品の wlot → 1 */
export function lotSize(p: Pick<Product, "id"> & Partial<Pick<Product, "wlot">>, client?: Pick<Client, "lots">): number {
  return client?.lots?.[p.id] || p.wlot || 1;
}

/**
 * 包装代/個 = その他(extra) + Σ(包装資材の単位原価 × 1個あたりの数)。use で出店用か卸し用かを選ぶ。
 * 卸し用で「1ロットあたり」の行は、ロットの枚数で割って1枚あたりにする
 */
export function packCost(
  p: Pick<Product, "extra" | "packs" | "wpacks"> & Partial<Pick<Product, "id" | "wlot" | "pc">>,
  mat: MatLookup,
  use: BakeUse = "event",
  lot?: number,
): number {
  const ls = (use === "whole" ? p.wpacks : p.packs) ?? [];
  const n = lot || p.wlot || 1;
  const per = ls.map((l) => (use === "whole" && l.per === "lot" ? { ...l, qty: l.qty / n } : l));
  // その他の包装代は販売単位(セット)あたり。卸しは1枚単位なので入数で割る
  const extra = (p.extra || 0) / (use === "whole" ? packOf(p) : 1);
  return clean(extra + batchCost({ lines: per }, mat));
}

/**
 * 材料原価/個 = ルセットの材料費 / 仕込み数 + 仕入れ値(雑貨)
 * 包装代込み原価 = 材料原価/個 + 包装代(出店用)。卸し用の原価 wtot は卸し用の包装資材で計算
 */
/** 販売の入数(なければ1) */
export function packOf(p: Partial<Pick<Product, "pc">>): number {
  return p.pc && p.pc > 0 ? p.pc : 1;
}

export function productCost(
  p: Pick<Product, "lines" | "yield" | "extra" | "buy" | "packs" | "wpacks"> & Partial<Pick<Product, "secs" | "id" | "wlot" | "pc" | "gram" | "dough">>,
  mat: MatLookup,
  lot?: number,
): ProductCost {
  const y = yieldOf(p, mat);
  const m = (y ? batchCost(p, mat) / y : 0) + (p.buy ?? 0);
  const pk = packCost(p, mat, "event");
  const wpk = packCost(p, mat, "whole", lot);
  const unit = m * packOf(p);
  return { mat: m, unit, pk, tot: unit + pk, wpk, wtot: m + wpk };
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
  /** 卸しの売上 */
  wh: number;
}

/** 卸しの納品の売上と原価 */
export function wholeTotals(w: Pick<WholeSale, "items">): { sales: number; cost: number } {
  return w.items.reduce((a, it) => ({ sales: a.sales + it.qty * it.price, cost: a.cost + it.qty * it.cost }), { sales: 0, cost: 0 });
}

export function monthly(year: number, events: EventRecord[], base: BaseRecord[], cfg: Config, whole: WholeSale[] = []): MonthRow[] {
  const r: MonthRow[] = Array.from({ length: 12 }, () => ({ mk: 0, base: 0, sq: 0, bf: 0, wh: 0 }));
  for (const w of whole) {
    if (+w.date.slice(0, 4) !== year) continue;
    r[+w.date.slice(5, 7) - 1].wh += wholeTotals(w).sales;
  }
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
  whole: WholeSale[] = [],
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
  // 卸し: 記録時点の卸価格と原価で(手数料なし)
  for (const w of whole) {
    if (!inP(w.date)) continue;
    const t = wholeTotals(w);
    o.sales += t.sales;
    o.cost += t.cost;
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
