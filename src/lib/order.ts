// 商品の並び順(SPEC.md 3章「並び順」)
import { readingKey } from "./matcat";
import type { Product } from "./types";

const LIMITED = /期間限定|季節限定/;

/** 季節限定か(印をつけたもの、または名前に「期間限定」「季節限定」がある) */
export function isSeasonal(p: Pick<Product, "name"> & Partial<Pick<Product, "season">>): boolean {
  return !!p.season || LIMITED.test(p.name);
}

/** ジャンルの中を「いつもの」と「季節限定」に分ける(どちらも並び順で) */
export function splitSeason<T extends Pick<Product, "id" | "name"> & Partial<Pick<Product, "season">>>(ps: T[]): { main: T[]; season: T[] } {
  const s = sortProds(ps);
  return { main: s.filter((p) => !isSeasonal(p)), season: s.filter(isSeasonal) };
}

/** 比べるための名前(【期間限定】や「有機」は除く) */
function core(name: string): string {
  return name.replace(/【[^】]*】|\[[^\]]*\]/g, "").replace(/^有機/, "").replace(/\s+/g, "").trim();
}

/**
 * ジャンルの中の並び順。似たものをまとめる。
 * - 名前に別の商品名を含むもの(「檸檬のフィナンシェ」→「フィナンシェ」)は、その商品のすぐ後
 * - 名前が「クッキー」で終わるものは「クッキー」のまとまり
 * - まとまりは読みの五十音順。【期間限定】は最後
 */
export function sortProds<T extends Pick<Product, "id" | "name"> & Partial<Pick<Product, "season">>>(ps: T[]): T[] {
  const cores = ps.map((p) => ({ p, c: core(p.name) }));
  const fam = new Map<string, string>();
  for (const { p, c } of cores) {
    // 自分より短く、自分の名前に含まれる、いちばん短い商品名
    const base = cores
      .filter((o) => o.p.id !== p.id && o.c && o.c.length < c.length && c.includes(o.c))
      .sort((a, b) => a.c.length - b.c.length)[0];
    fam.set(p.id, base ? base.c : /クッキー$/.test(c) ? "クッキー" : c);
  }
  return [...ps].sort((a, b) => {
    const la = isSeasonal(a) ? 1 : 0;
    const lb = isSeasonal(b) ? 1 : 0;
    if (la !== lb) return la - lb;
    const fa = readingKey(fam.get(a.id)!);
    const fb = readingKey(fam.get(b.id)!);
    if (fa !== fb) return fa.localeCompare(fb, "ja");
    // まとまりの元の商品を先に
    const ba = core(a.name) === fam.get(a.id) ? 0 : 1;
    const bb = core(b.name) === fam.get(b.id) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    return readingKey(core(a.name)).localeCompare(readingKey(core(b.name)), "ja");
  });
}
