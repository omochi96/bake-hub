// 商品の並び順(SPEC.md 3章「並び順」)
import { readingKey } from "./matcat";
import type { Product } from "./types";

const LIMITED = /【期間限定】|\[期間限定\]/;

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
export function sortProds<T extends Pick<Product, "id" | "name">>(ps: T[]): T[] {
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
    const la = LIMITED.test(a.name) ? 1 : 0;
    const lb = LIMITED.test(b.name) ? 1 : 0;
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
