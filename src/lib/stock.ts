// 在庫の増減ルール(SPEC.md 5章)とお知らせ(6章)。
// どれも「元のデータは変えずに、変わった後の値」を返す。
// 保存の段階で、前後の差分を increment(足し引き)として書き込む。
import { activeLines, doughWeight, productCost, type MatLookup } from "./calc";
import type { BakeUse, EventItem, Material, Product } from "./types";

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

export interface ProduceNeed extends BakeNeed {
  /** ルセットの材料か、包装資材か */
  kind: "recipe" | "pack";
  /** 見出し(枠の名前、または「○○の生地(200g)」)。本体は "" */
  group: string;
}

/** 詰め合わせに入れるお菓子の必要数 */
export interface PieceNeed {
  prod: Product;
  need: number;
  short: boolean;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 生地の行を、元の商品の材料に割合で広げる(生地の中の生地も。3段まで) */
function expandDough(q: Product, grams: number, mat: MatLookup, group: string, out: ProduceNeed[], depth: number) {
  const w = doughWeight(q, mat);
  if (!w || depth >= 3) return;
  const k = grams / w;
  for (const l of activeLines(q)) {
    if (l.c) continue;
    if (l.d) {
      const sub = mat.prod?.(l.d);
      if (sub) expandDough(sub, l.qty * k, mat, group, out, depth + 1);
      continue;
    }
    const m = mat(l.m);
    if (m) out.push({ mat: m, need: l.qty * k, short: false, kind: "recipe", group });
  }
}

/**
 * 作る数に対する、材料と包装資材の必要量(SPEC.md 5章)。
 * 材料 = 使用量 × 作る数 / 仕込み数(トッピングはオンの枠だけ)、生地の行は元の商品の材料を割合で、
 * 包装資材 = 1個あたりの数 × 作る数(出店用は packs、卸し用は wpacks)。
 * 同じ材料が何か所かにあれば、合計で在庫と比べる(short はその合計で判定)。
 */
export function produceNeeds(p: Product, n: number, use: BakeUse, mat: MatLookup, on?: ReadonlySet<string>): ProduceNeed[] {
  const f = p.yield ? n / p.yield : 0;
  const secName = (id?: string) => (id ? p.secs?.find((x) => x.id === id)?.name ?? "" : "");
  const out: ProduceNeed[] = [];
  for (const l of activeLines(p, on)) {
    if (l.c) continue;
    if (l.d) {
      const q = mat.prod?.(l.d);
      if (q) expandDough(q, l.qty * f, mat, `${q.name}の生地(${r2(l.qty * f)}g)`, out, 0);
      continue;
    }
    const m = mat(l.m);
    if (m) out.push({ mat: m, need: l.qty * f, short: false, kind: "recipe", group: secName(l.sec) });
  }
  for (const l of (use === "whole" ? p.wpacks : p.packs) ?? []) {
    const m = mat(l.m);
    if (m) out.push({ mat: m, need: l.qty * n, short: false, kind: "pack", group: "" });
  }
  const total = new Map<string, number>();
  for (const x of out) total.set(x.mat.id, (total.get(x.mat.id) ?? 0) + x.need);
  for (const x of out) x.short = x.mat.qty < r2(total.get(x.mat.id)!);
  return out;
}

/** 詰め合わせに入れるお菓子の必要数(枚数 × 作る数 / 仕込み数)。在庫より多ければ short */
export function producePieces(p: Product, n: number, mat: MatLookup, on?: ReadonlySet<string>): PieceNeed[] {
  const f = p.yield ? n / p.yield : 0;
  const total = new Map<string, number>();
  for (const l of activeLines(p, on)) if (l.c) total.set(l.c, (total.get(l.c) ?? 0) + l.qty * f);
  const out: PieceNeed[] = [];
  for (const [id, need] of total) {
    const q = mat.prod?.(id);
    if (q) out.push({ prod: q, need: r2(need), short: q.stock < r2(need) });
  }
  return out;
}

export type ProduceResult =
  | { ok: false; reason: "no-count" }
  | { ok: false; reason: "shortage"; shortages: string[] }
  | { ok: true; used: Record<string, number>; pused: Record<string, number>; stockAdd: number };

/** 「作成を記録」。足りないものがあれば実行しない。卸し用は商品の在庫を増やさない */
export function produce(p: Product, n: number, use: BakeUse, mat: MatLookup, on?: ReadonlySet<string>): ProduceResult {
  if (!n) return { ok: false, reason: "no-count" };
  const needs = produceNeeds(p, n, use, mat, on);
  const pieces = producePieces(p, n, mat, on);
  const shortages = [...new Set([...needs.filter((x) => x.short).map((x) => x.mat.name), ...pieces.filter((x) => x.short).map((x) => x.prod.name)])];
  if (shortages.length) return { ok: false, reason: "shortage", shortages };
  const used: Record<string, number> = {};
  for (const x of needs) used[x.mat.id] = (used[x.mat.id] ?? 0) + x.need;
  for (const k of Object.keys(used)) used[k] = r2(used[k]);
  const pused: Record<string, number> = {};
  for (const x of pieces) pused[x.prod.id] = x.need;
  return { ok: true, used, pused, stockAdd: use === "event" ? n : 0 };
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
