// データの預かり所。
// 画面は「変更の指示(Op)」を apply() に渡すだけにする。
// いまは端末の中(localStorage)に保存。あとで同じ Op を Firestore への書き込みに置き換える。
import { useEffect, useState } from "preact/hooks";
import type { AppData, BaseRecord, Config, EventRecord, Material, Product, Schedule, Targets } from "../lib/types";
import { initialData, normalize, type Photos } from "./seed";

export type Col = "mats" | "prods" | "sched" | "events" | "base";
type Item<C extends Col> = AppData[C][number];

export type Op =
  | { t: "add"; col: Col; item: Material | Product | Schedule | EventRecord | BaseRecord; first?: boolean }
  | { t: "patch"; col: Col; id: string; patch: Record<string, unknown> }
  | { t: "del"; col: Col; id: string }
  /** 在庫などの足し引き。2台で同時に変えても数が合うよう、差分で渡す */
  | { t: "incr"; col: Col; id: string; field: string; delta: number }
  | { t: "cfg"; patch: Partial<Config> }
  | { t: "tg"; patch: Partial<Targets> }
  | { t: "photo"; id: string; value: string | null };

export type SyncState = "local" | "saving" | "synced" | "offline" | "error";

const KEY = "bakehub-v2";
const PKEY = "bakehub-v2-photos";

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Op をデータに当てはめる(元は変えず、新しいデータを返す) */
export function applyOps(d: AppData, photos: Photos, ops: Op[]): { data: AppData; photos: Photos } {
  let data = d;
  let ph = photos;
  const touch = <C extends Col>(col: C, f: (xs: Item<C>[]) => Item<C>[]) => {
    data = { ...data, [col]: f(data[col] as Item<C>[]) };
  };
  for (const op of ops) {
    switch (op.t) {
      case "add":
        touch(op.col, (xs) => (op.first ? [op.item as never, ...xs] : [...xs, op.item as never]));
        break;
      case "patch":
        touch(op.col, (xs) => xs.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)));
        break;
      case "del":
        touch(op.col, (xs) => xs.filter((x) => x.id !== op.id));
        break;
      case "incr":
        touch(op.col, (xs) =>
          xs.map((x) =>
            x.id === op.id ? { ...x, [op.field]: round(((x as any)[op.field] || 0) + op.delta) } : x,
          ),
        );
        break;
      case "cfg":
        data = { ...data, cfg: { ...data.cfg, ...op.patch } };
        break;
      case "tg":
        data = { ...data, cfg: { ...data.cfg, tg: { ...data.cfg.tg, ...op.patch } } };
        break;
      case "photo": {
        ph = { ...ph };
        if (op.value) ph[op.id] = op.value;
        else delete ph[op.id];
        break;
      }
    }
  }
  return { data, photos: ph };
}

class Store {
  data: AppData;
  photos: Photos;
  sync: SyncState = "local";
  private ls = new Set<() => void>();

  constructor() {
    let d: AppData | null = null;
    let p: Photos = {};
    try {
      d = JSON.parse(localStorage.getItem(KEY) || "null");
      p = JSON.parse(localStorage.getItem(PKEY) || "{}");
    } catch {
      /* 読めなければ初期データ */
    }
    if (d && d.mats) {
      this.data = d;
      this.photos = p;
    } else {
      const n = normalize(initialData());
      this.data = n.data;
      this.photos = n.photos;
      this.persist(true);
    }
  }

  apply(ops: Op[]) {
    if (!ops.length) return;
    const r = applyOps(this.data, this.photos, ops);
    const photoChanged = r.photos !== this.photos;
    this.data = r.data;
    this.photos = r.photos;
    this.persist(photoChanged);
    this.emit();
  }

  /** 全体を置き換える(JSONの読み込み用) */
  replace(data: AppData, photos: Photos) {
    this.data = data;
    this.photos = photos;
    this.persist(true);
    this.emit();
  }

  private persist(photos: boolean) {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      if (photos) localStorage.setItem(PKEY, JSON.stringify(this.photos));
    } catch {
      /* 容量オーバーなど。Firebase接続後はそちらが本体になる */
    }
  }

  subscribe(f: () => void) {
    this.ls.add(f);
    return () => this.ls.delete(f);
  }

  private emit() {
    this.ls.forEach((f) => f());
  }
}

export const store = new Store();

/** 画面からデータを読むためのフック。データが変わると描き直す */
export function useData(): AppData {
  const [, set] = useState(0);
  useEffect(() => store.subscribe(() => set((n) => n + 1)), []);
  return store.data;
}

export function usePhotos(): Photos {
  const [, set] = useState(0);
  useEffect(() => store.subscribe(() => set((n) => n + 1)), []);
  return store.photos;
}
