// BASE・Square の売上の取り込み(SPEC.md 12章)。画面やFirebaseに触らない計算だけ。

export interface ProdLite {
  id: string;
  /** 販売の入数(グラムで売る商品は1袋の重さ) */
  pc?: number;
  baseItem?: string;
  sqItem?: string;
}

export interface SaleLine {
  /** 外の商品キー(base:<商品ID>[:<種類ID>] / sq:<バリエーションID>) */
  ext: string;
  name: string;
  qty: number;
  price: number;
}

export interface Pay {
  cash: number;
  card: number;
  emoney: number;
  qr: number;
}

export interface OSale {
  id: string;
  src: "base" | "square";
  oid: string;
  at: string;
  date: string;
  total: number;
  lines: SaleLine[];
  pay?: Pay;
  stock?: Record<string, number>;
  cancelled?: true;
}

export interface ExtItem {
  id: string;
  src: "base" | "square";
  ext: string;
  name: string;
  price: number;
}

/** 日本時間の日付 "YYYY-MM-DD" */
export function jstDate(iso: string): string {
  const t = new Date(iso).getTime() + 9 * 3600_000;
  return new Date(t).toISOString().slice(0, 10);
}

const int = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

// ---- BASE ----

export interface BaseLine {
  item_id: number;
  variation_id?: number | null;
  title: string;
  variation?: string | null;
  price: number;
  amount: number;
  status?: string;
}

export interface BaseOrder {
  unique_key: string;
  ordered_at: string;
  cancelled_at?: string | null;
  amounts?: { total?: number };
  lines?: BaseLine[];
}

export function baseKey(itemId: number | string, variationId?: number | string | null): string {
  return variationId ? `base:${itemId}:${variationId}` : `base:${itemId}`;
}

/** BASEの注文(詳細)を、取り込む形にする。キャンセルされた明細は除く */
export function baseOrderToSale(o: BaseOrder): OSale {
  const lines = (o.lines ?? [])
    .filter((l) => !/cancel/i.test(l.status ?? ""))
    .map((l) => ({
      ext: baseKey(l.item_id, l.variation_id),
      name: l.variation ? `${l.title}(${l.variation})` : l.title,
      qty: int(l.amount),
      price: int(l.price),
    }));
  return {
    id: `base-${o.unique_key}`,
    src: "base",
    oid: o.unique_key,
    at: o.ordered_at,
    date: jstDate(o.ordered_at),
    total: int(o.amounts?.total),
    lines,
  };
}

/** 外の商品キー → 商品 */
function byExt(prods: ProdLite[], field: "baseItem" | "sqItem"): Map<string, ProdLite> {
  const m = new Map<string, ProdLite>();
  for (const p of prods) {
    const k = p[field];
    if (k) m.set(k, p);
  }
  return m;
}

/** BASEの注文で減らす在庫(商品id → 枚・g)。対応づけのない明細は数えない */
export function baseStockDelta(sale: OSale, prods: ProdLite[]): Record<string, number> {
  const m = byExt(prods, "baseItem");
  const out: Record<string, number> = {};
  for (const l of sale.lines) {
    // 種類つきの商品は、種類ごとの対応がなければ商品全体の対応を使う
    const p = m.get(l.ext) ?? m.get(l.ext.split(":").slice(0, 2).join(":"));
    if (!p || l.qty <= 0) continue;
    const n = l.qty * (p.pc && p.pc > 0 ? p.pc : 1);
    out[p.id] = (out[p.id] ?? 0) + n;
  }
  return out;
}

export interface BaseItem {
  id: number;
  name: string;
  price?: number | null;
  variations?: { id: number; name?: string | null; title?: string | null; price?: number | null }[];
}

export function baseExtItems(items: BaseItem[]): ExtItem[] {
  const out: ExtItem[] = [];
  for (const it of items) {
    const vs = it.variations ?? [];
    if (vs.length > 1) {
      for (const v of vs) {
        const ext = baseKey(it.id, v.id);
        const vn = v.name ?? v.title ?? "";
        out.push({ id: ext.replace(/:/g, "-"), src: "base", ext, name: vn ? `${it.name}(${vn})` : it.name, price: int(v.price ?? it.price) });
      }
    } else {
      const ext = baseKey(it.id);
      out.push({ id: ext.replace(/:/g, "-"), src: "base", ext, name: it.name, price: int(it.price) });
    }
  }
  return out;
}

/** 取り込んだBASEの注文の、月別の合計(キャンセルを除く) */
export function baseMonthly(sales: OSale[]): Record<string, { sales: number; orders: number }> {
  const out: Record<string, { sales: number; orders: number }> = {};
  for (const s of sales) {
    if (s.src !== "base" || s.cancelled) continue;
    const m = s.date.slice(0, 7);
    out[m] ??= { sales: 0, orders: 0 };
    out[m].sales += s.total;
    out[m].orders += 1;
  }
  return out;
}

// ---- Square ----

interface Money {
  amount?: number | string | null;
}

export interface SqOrder {
  id: string;
  state?: string;
  closed_at?: string;
  created_at?: string;
  total_money?: Money;
  line_items?: {
    name?: string;
    variation_name?: string;
    quantity?: string;
    catalog_object_id?: string;
    base_price_money?: Money;
  }[];
  tenders?: {
    type?: string;
    amount_money?: Money;
    card_details?: { card?: { card_brand?: string } };
  }[];
}

/** 支払い方法の振り分け(SPEC.md 12章) */
export function tenderKind(t: NonNullable<SqOrder["tenders"]>[number]): keyof Pay {
  const type = (t.type ?? "").toUpperCase();
  if (type === "CASH") return "cash";
  if (type === "WALLET") return "qr";
  const brand = (t.card_details?.card?.card_brand ?? "").toUpperCase();
  if (brand.startsWith("FELICA")) return "emoney";
  return "card";
}

const sqName = (name?: string, vname?: string) =>
  vname && !/^(regular|通常|レギュラー)$/i.test(vname) ? `${name ?? ""}(${vname})` : (name ?? "");

export function sqOrderToSale(o: SqOrder): OSale {
  const at = o.closed_at ?? o.created_at ?? new Date(0).toISOString();
  const pay: Pay = { cash: 0, card: 0, emoney: 0, qr: 0 };
  for (const t of o.tenders ?? []) pay[tenderKind(t)] += int(t.amount_money?.amount);
  const lines = (o.line_items ?? []).map((l) => ({
    ext: l.catalog_object_id ? `sq:${l.catalog_object_id}` : `sq:custom:${l.name ?? ""}`,
    name: sqName(l.name, l.variation_name) || "(名前なし)",
    qty: int(l.quantity),
    price: int(l.base_price_money?.amount),
  }));
  return { id: `sq-${o.id}`, src: "square", oid: o.id, at, date: jstDate(at), total: int(o.total_money?.amount), lines, pay };
}

export interface SqCatalogObject {
  type?: string;
  id: string;
  is_deleted?: boolean;
  item_data?: {
    name?: string;
    variations?: { id: string; is_deleted?: boolean; item_variation_data?: { name?: string; price_money?: Money } }[];
  };
}

export function sqExtItems(objs: SqCatalogObject[]): ExtItem[] {
  const out: ExtItem[] = [];
  for (const o of objs) {
    if (o.type !== "ITEM" || o.is_deleted || !o.item_data) continue;
    const vs = (o.item_data.variations ?? []).filter((v) => !v.is_deleted);
    for (const v of vs) {
      const ext = `sq:${v.id}`;
      const vn = v.item_variation_data?.name;
      out.push({
        id: ext.replace(/:/g, "-"),
        src: "square",
        ext,
        name: vs.length > 1 ? sqName(o.item_data.name, vn) || (o.item_data.name ?? "") : (o.item_data.name ?? ""),
        price: int(v.item_variation_data?.price_money?.amount),
      });
    }
  }
  return out;
}

/** 取り込みを始める日(注文の検索に使う。BASEの検索は最長1年) */
export function searchFromDate(from: string, now: Date): string {
  const min = new Date(now.getTime() - 360 * 86400_000).toISOString();
  return jstDate(from > min ? from : min);
}
