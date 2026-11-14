// 在庫の増減ルール(SPEC.md 5章)とお知らせ(6章)。
// どれも「元のデータは変えずに、変わった後の値」を返す。
// 保存の段階で、前後の差分を increment(足し引き)として書き込む。
import { productCost, type MatLookup } from "./calc";
import type { EventItem, Material, Product } from "./types";

/** ＋1パック入庫 */
export function packIn(m: Material): number {
  return m.qty + m.packQty;
}

export interface BakeNeed {
  mat: Material;
  need: number;
  short: boolean;
}

/** 焼きたい数に対する材料の必要量。在庫より多ければ short */
export function bakeNeeds(p: Product, n: number, mat: MatLookup): BakeNeed[] {
  const f = p.yield ? n / p.yield : 0;
  const out: BakeNeed[] = [];
  for (const l of p.lines) {
    const m = mat(l.m);
    if (!m) continue;
    const need = l.qty * f;
    out.push({ mat: m, need, short: m.qty < need });
  }
  return out;
}

export type BakeResult =
  | { ok: false; reason: "no-count" }
  | { ok: false; reason: "shortage"; shortages: string[] }
  | { ok: true; matQty: Record<string, number>; stock: number };

/** 「作成して在庫を更新」。足りない材料があれば実行しない */
export function bake(p: Product, n: number, mat: MatLookup): BakeResult {
  if (!n) return { ok: false, reason: "no-count" };
  const needs = bakeNeeds(p, n, mat);
  const shortages = needs.filter((x) => x.short).map((x) => x.mat.name);
  if (shortages.length) return { ok: false, reason: "shortage", shortages };
  const matQty: Record<string, number> = {};
  for (const x of needs) {
    const cur = matQty[x.mat.id] ?? x.mat.qty;
    matQty[x.mat.id] = Math.round((cur - x.need) * 100) / 100;
  }
  return { ok: true, matQty, stock: p.stock + n };
}

/** 記録画面の入力(商品id → 売れた数・ロス数) */
export type DraftItems = Record<string, { sold?: number; loss?: number }>;

/** 入力から記録用の items を作る。記録時点の原価と販売価格を残す */
export function buildEventItems(prods: Product[], draft: DraftItems, mat: MatLookup): EventItem[] {
  const its: EventItem[] = [];
  for (const q of prods) {
    const x = draft[q.id];
    if (!x || !(x.sold || x.loss)) continue;
    const so = x.sold || 0;
    const lo = x.loss || 0;
    its.push({ id: q.id, name: q.name, sold: so, loss: lo, out: so + lo, cost: productCost(q, mat).tot, price: q.price });
  }
  return its;
}

/**
 * イベント記録の保存・再編集・削除による、商品在庫の変化。
 * 古い分(oldItems)を戻してから、新しい分(newItems)を引く。0未満にはしない。
 * 削除は newItems = [] として呼ぶ。
 * 戻り値は、在庫が変わる商品だけの「変わった後の在庫」。
 */
export function applyEventStock(
  prods: Product[],
  oldItems: EventItem[],
  newItems: EventItem[],
): Record<string, number> {
  const stock = new Map(prods.map((p) => [p.id, p.stock]));
  for (const x of oldItems) {
    if (stock.has(x.id)) stock.set(x.id, stock.get(x.id)! + x.out);
  }
  for (const x of newItems) {
    if (stock.has(x.id)) stock.set(x.id, Math.max(0, stock.get(x.id)! - x.out));
  }
  const out: Record<string, number> = {};
  for (const p of prods) {
    const v = stock.get(p.id)!;
    if (v !== p.stock) out[p.id] = v;
  }
  return out;
}

// ---- お知らせ ----

/** 材料: qty <= min なら発注アラート */
export function isLowMat(m: Material): boolean {
  return m.qty <= m.min;
}

/** 商品: min > 0 かつ stock <= min なら在庫アラート */
export function isLowProd(p: Product): boolean {
  return p.min > 0 && p.stock <= p.min;
}
