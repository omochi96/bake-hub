// BASE・Square の取り込み(SPEC.md 12章)のうち、アプリ側で使う計算
import type { ExtItem, OSale, Product } from "./types";

export interface SquareFill {
  /** その日のSquareの注文の数 */
  n: number;
  total: number;
  pay: { cash: number; card: number; emoney: number; qr: number };
  /** 商品id → 売れた数(販売単位) */
  sold: Record<string, number>;
  /** 対応づけのない商品の名前と数 */
  unknown: { name: string; qty: number }[];
}

/** イベントの日のSquareの売上を、記録の形にまとめる */
export function squareFill(osales: OSale[], prods: Pick<Product, "id" | "sqItem">[], date: string): SquareFill {
  const byExt = new Map<string, string>();
  for (const p of prods) if (p.sqItem) byExt.set(p.sqItem, p.id);
  const r: SquareFill = { n: 0, total: 0, pay: { cash: 0, card: 0, emoney: 0, qr: 0 }, sold: {}, unknown: [] };
  const unk = new Map<string, number>();
  for (const s of osales) {
    if (s.src !== "square" || s.cancelled || s.date !== date) continue;
    r.n++;
    r.total += s.total;
    for (const k of ["cash", "card", "emoney", "qr"] as const) r.pay[k] += s.pay?.[k] ?? 0;
    for (const l of s.lines) {
      const id = byExt.get(l.ext);
      if (id) r.sold[id] = (r.sold[id] ?? 0) + l.qty;
      else unk.set(l.name, (unk.get(l.name) ?? 0) + l.qty);
    }
  }
  r.unknown = [...unk].map(([name, qty]) => ({ name, qty }));
  return r;
}

/** まだどの商品にも対応づけていない、外の商品 */
export function unlinked(ext: ExtItem[], prods: Pick<Product, "baseItem" | "sqItem">[], src: "base" | "square"): ExtItem[] {
  const used = new Set(prods.map((p) => (src === "base" ? p.baseItem : p.sqItem)).filter(Boolean));
  return ext.filter((x) => x.src === src && !used.has(x.ext));
}

/** 名前の比べ方(空白・記号・【】の中を無視) */
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/【[^】]*】/g, "")
    .replace(/[\s・\-ー_()()「」]/g, "")
    .toLowerCase();
}

/** 商品に合いそうな外の商品(名前が含まれているもの)を先に並べる */
export function suggestOrder(ext: ExtItem[], name: string): ExtItem[] {
  const n = norm(name);
  const score = (x: ExtItem) => {
    const e = norm(x.name);
    if (e === n) return 0;
    if (n && (e.includes(n) || n.includes(e))) return 1;
    return 2;
  };
  return ext.slice().sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "ja"));
}

/** 名前がそのまま合う(または片方がもう片方を含む)ものが1つだけなら、それ */
export function bestMatch(ext: ExtItem[], name: string): ExtItem | null {
  const n = norm(name);
  const exact = ext.filter((x) => norm(x.name) === n);
  if (exact.length === 1) return exact[0];
  const part = ext.filter((x) => {
    const e = norm(x.name);
    return n && (e.includes(n) || n.includes(e));
  });
  return part.length === 1 ? part[0] : null;
}

/** 外の商品を、アプリの商品に結びつける(prodId が空なら外す)。前に結びついていた商品は外す */
export function linkPatches(
  prods: Pick<Product, "id" | "baseItem" | "sqItem">[],
  x: Pick<ExtItem, "src" | "ext">,
  prodId: string,
): { id: string; patch: Partial<Pick<Product, "baseItem" | "sqItem">> }[] {
  const field = x.src === "base" ? "baseItem" : "sqItem";
  const out: { id: string; patch: Partial<Pick<Product, "baseItem" | "sqItem">> }[] = [];
  for (const p of prods) {
    if (p[field] === x.ext && p.id !== prodId) out.push({ id: p.id, patch: { [field]: null } as never });
  }
  if (prodId) out.push({ id: prodId, patch: { [field]: x.ext } });
  return out;
}
