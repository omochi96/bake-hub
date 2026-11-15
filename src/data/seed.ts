// 初回のデータと、旧データの整形(旧版の初期値 S と ens() に相当)
import { uid } from "../lib/format";
import type { AppData, Product } from "../lib/types";
import { BUILTIN, builtinKeyFor } from "./photos";

export type Photos = Record<string, string>;

function blankProduct(name: string, genre: string): Product {
  return { id: uid(), genre, name, yield: 10, extra: 0, stock: 0, min: 0, price: 0, whole: 0, lines: [] };
}

/** 初めて開いたときのデータ。旧版で何もない状態から開いたときと同じ */
export function initialData(): AppData {
  return {
    cfg: {
      cash: 0,
      card: 3.25,
      emoney: 3.25,
      qr: 3.25,
      baseRate: 6.6,
      baseFix: 40,
      target: 30,
      whole: 60,
      tg: { cost: 30, fee: 5, event: 10, rent: 20, fixed: 5 },
      rent: 0,
      fixed: 0,
    },
    mats: [
      { id: "m1", name: "薄力粉", unit: "g", packQty: 1000, packPrice: 280, qty: 3000, min: 1500 },
      { id: "m2", name: "バター", unit: "g", packQty: 450, packPrice: 900, qty: 600, min: 450 },
      { id: "m3", name: "砂糖", unit: "g", packQty: 1000, packPrice: 240, qty: 2500, min: 800 },
      { id: "m4", name: "卵", unit: "個", packQty: 10, packPrice: 280, qty: 12, min: 4 },
    ],
    prods: [
      {
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
      },
    ],
    sched: [],
    events: [],
    base: [],
    plans: [],
    bakes: [],
  };
}

/**
 * 旧データ(bakehub-v1)や初期データを、いまの形にそろえる。
 * 足りない項目を補い、初期の商品を追加し、写真を商品idに割り当てる。
 * 元のデータは変えずに、新しいデータを返す。
 */
export function normalize(src: AppData, photos: Photos = {}): { data: AppData; photos: Photos } {
  const o: AppData = JSON.parse(JSON.stringify(src));
  const ph: Photos = { ...photos };
  o.sched ??= [];
  o.events ??= [];
  o.plans ??= [];
  o.bakes ??= [];
  o.base ??= [];
  o.cfg.tg ??= { cost: o.cfg.target || 30, fee: 5, event: 10, rent: 20, fixed: 5 };
  o.cfg.rent ??= 0;
  o.cfg.fixed ??= 0;
  for (const p of o.prods) {
    if (!p.genre) p.genre = /クッキー/.test(p.name) ? "チャンククッキー" : "焼き菓子";
    p.lines ??= [];
  }
  if (!o.seed2) {
    o.seed2 = 1;
    for (const [key, name] of BUILTIN) {
      if (o.seed1 && key !== "レーズン") continue;
      if (!o.prods.some((p) => p.name.includes(key))) o.prods.push(blankProduct(name, "チャンククッキー"));
    }
  }
  // 予定とひも付いていない記録には、予定を作る
  for (const e of o.events) {
    if (e.sid) continue;
    const id = uid();
    o.sched.push({ id, date: e.date, name: e.name || "イベント", place: "", start: "", end: "" });
    e.sid = id;
  }
  // 写真がまだない商品に、名前で初期写真を割り当てる(この1回だけ)
  for (const p of o.prods) {
    if (ph[p.id]) continue;
    const k = builtinKeyFor(p.name);
    if (k) ph[p.id] = "builtin:" + k;
  }
  return { data: o, photos: ph };
}
