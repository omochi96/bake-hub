// データの書き出し(JSON)と読み込み。旧アプリのデータ(bakehub-v1 の S)も読める。
import type { AppData } from "../lib/types";
import { normalize, type Photos } from "./seed";

export interface Backup {
  format: "bakehub";
  version: 2;
  exportedAt: string;
  data: AppData;
  photos: Photos;
}

export function makeBackup(data: AppData, photos: Photos, now = new Date()): Backup {
  return { format: "bakehub", version: 2, exportedAt: now.toISOString(), data, photos };
}

export interface Parsed {
  kind: "v2" | "legacy";
  data: AppData;
  photos: Photos;
}

function isAppData(o: unknown): o is AppData {
  const d = o as AppData;
  return !!d && typeof d === "object" && Array.isArray(d.mats) && Array.isArray(d.prods) && !!d.cfg && typeof d.cfg === "object";
}

/** 読み込んだ文字を確かめて、いまの形にそろえる。読めなければ、理由を書いたエラーを投げる */
export function parseBackup(text: string): Parsed {
  let o: unknown;
  try {
    o = JSON.parse(text.trim());
  } catch {
    throw new Error("JSONとして読めませんでした。ファイルか、貼り付けた内容を確かめてください。");
  }
  const b = o as Partial<Backup>;
  if (b && b.format === "bakehub") {
    if (!isAppData(b.data)) throw new Error("BAKE HUBのファイルですが、中身が足りません。");
    const n = normalize(b.data, b.photos ?? {});
    return { kind: "v2", data: n.data, photos: n.photos };
  }
  if (isAppData(o)) {
    // 旧アプリのデータ。写真は商品名で初期写真を割り当てる
    const n = normalize(o, {});
    return { kind: "legacy", data: n.data, photos: n.photos };
  }
  throw new Error("BAKE HUBのデータではないようです。");
}

export function summary(d: AppData): string {
  return `材料${d.mats.length}件、商品${d.prods.length}件、出店予定${d.sched.length}件、出店の記録${d.events.length}件、BASE${d.base.length}件、製造予定${(d.plans ?? []).length}件、製造記録${(d.bakes ?? []).length}件、卸先${(d.clients ?? []).length}件、卸しの納品${(d.wsales ?? []).length}件`;
}
