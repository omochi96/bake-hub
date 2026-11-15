// 製造記録の保存と取り消し(SPEC.md 5章)。在庫は差分(足し引き)で書き込む。
import type { Bake } from "../lib/types";
import type { Op } from "./store";

/** 記録を残し、材料と包装資材を減らし、出店用なら商品の在庫を増やす。予定から記録したら、予定を済みにする */
export function bakeOps(b: Bake): Op[] {
  const ops: Op[] = Object.entries(b.used).map(([id, q]) => ({ t: "incr", col: "mats", id, field: "qty", delta: -q }));
  if (b.stockAdd) ops.push({ t: "incr", col: "prods", id: b.prod, field: "stock", delta: b.stockAdd });
  ops.push({ t: "add", col: "bakes", item: b, first: true });
  if (b.plan) ops.push({ t: "patch", col: "plans", id: b.plan, patch: { done: true } });
  return ops;
}

/** 記録を消して、減らした分と足した在庫を戻す。もう無い材料・商品は戻さない */
export function undoBakeOps(b: Bake, exists: { mats: Set<string>; prods: Set<string> }): Op[] {
  const ops: Op[] = Object.entries(b.used)
    .filter(([id]) => exists.mats.has(id))
    .map(([id, q]) => ({ t: "incr", col: "mats", id, field: "qty", delta: q }));
  if (b.stockAdd && exists.prods.has(b.prod)) ops.push({ t: "incr", col: "prods", id: b.prod, field: "stock", delta: -b.stockAdd });
  ops.push({ t: "del", col: "bakes", id: b.id });
  return ops;
}
