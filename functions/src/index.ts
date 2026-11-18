// BASE・Square の売上の取り込み(SPEC.md 12章)
// 15分ごとと、アプリの「今すぐ取り込む」で動く。BASE・Square には書き込まない(読むだけ)。
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentReference, type WriteBatch } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  baseExtItems,
  baseMonthly,
  baseOrderToSale,
  baseStockDelta,
  searchFromDate,
  sqExtItems,
  sqOrderToSale,
  jstDate,
  type BaseItem,
  type BaseOrder,
  type ExtItem,
  type OSale,
  type ProdLite,
  type SqCatalogObject,
  type SqOrder,
} from "./logic.js";

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const BASE_API = "https://apiv2.thebase.com";
const SQ_API = "https://connect.squareup.com";
const SQ_VERSION = "2025-01-23";

class ApiError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

/** エラーを店主向けの短い文にする */
function explain(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "鍵が使えません(期限切れか、貼り付けのまちがい)。新しい鍵を貼り付けてください";
    if (e.status === 403) return "鍵の権限が足りません。作り直すときに、読み取りの権限を付けてください";
    if (e.status === 429) return "混み合っています。次の取り込みで再開します";
    return `つながりませんでした(${e.status})`;
  }
  return "つながりませんでした";
}

async function call<T>(url: string, token: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...extra },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

/** 店主のid(users の下にある、設定のある1人) */
async function ownerUid(): Promise<string | null> {
  const refs = await db.collection("users").listDocuments();
  for (const r of refs) {
    const cfg = await r.collection("settings").doc("cfg").get();
    if (cfg.exists) return r.id;
  }
  return null;
}

/** 書き込みを400件ずつに分けて送る */
async function commitAll(writes: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach((w) => w(b));
    await b.commit();
  }
}

/** 外の商品の一覧を置き換える(その店の分だけ) */
async function saveExtItems(uid: string, src: "base" | "square", items: ExtItem[]) {
  const col = db.collection("users").doc(uid).collection("extitems");
  const old = await col.where("src", "==", src).get();
  const keep = new Set(items.map((x) => x.id));
  const writes: ((b: WriteBatch) => void)[] = [];
  old.docs.forEach((d) => {
    if (!keep.has(d.id)) writes.push((b) => b.delete(d.ref));
  });
  items.forEach((x) => writes.push((b) => b.set(col.doc(x.id), x)));
  await commitAll(writes);
}

// ---- BASE ----

async function syncBase(uid: string, token: string, from: string, prods: ProdLite[]): Promise<number> {
  const user = db.collection("users").doc(uid);
  // 商品の一覧(対応づけの候補)
  const items: BaseItem[] = [];
  for (let off = 0; off < 5000; off += 100) {
    const page = await call<BaseItem[]>(`${BASE_API}/api/items?limit=100&offset=${off}`, token);
    items.push(...page);
    if (page.length < 100) break;
  }
  await saveExtItems(uid, "base", baseExtItems(items));

  // 注文(取り込み開始より後だけ)
  const now = new Date();
  const summaries: BaseOrder[] = [];
  for (let page = 1; page <= 500; page++) {
    const r = await call<{ orders: BaseOrder[]; pagination: { has_next: boolean } }>(`${BASE_API}/api/orders/search`, token, {
      method: "POST",
      body: JSON.stringify({ ordered_from_date: searchFromDate(from, now), ordered_to_date: jstDate(now.toISOString()), sort: "ordered_asc", limit: 200, page }),
    });
    summaries.push(...r.orders.filter((o) => new Date(o.ordered_at) >= new Date(from)));
    if (!r.pagination?.has_next) break;
  }
  const col = user.collection("osales");
  const refs = summaries.map((o) => col.doc(`base-${o.unique_key}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  let added = 0;
  for (let i = 0; i < summaries.length; i++) {
    const o = summaries[i];
    const ref = refs[i];
    const old = snaps[i].exists ? (snaps[i].data() as OSale) : null;
    if (!old) {
      if (o.cancelled_at) continue;
      const detail = await call<BaseOrder>(`${BASE_API}/api/orders/${o.unique_key}`, token);
      const sale = baseOrderToSale(detail);
      const stock = baseStockDelta(sale, prods);
      await applyStock(ref, { ...sale, stock }, stock, -1, user);
      added++;
    } else if (!old.cancelled && o.cancelled_at) {
      // キャンセル: 減らした在庫を戻す
      const back = Object.fromEntries(Object.entries(old.stock ?? {}).filter(([id]) => prods.some((p) => p.id === id)));
      await applyStock(ref, { ...old, cancelled: true }, back, +1, user);
    }
  }

  // 月別の合計(base/auto-YYYY-MM)
  const all = (await col.where("src", "==", "base").get()).docs.map((d) => d.data() as OSale);
  const months = baseMonthly(all);
  const autos = await user.collection("base").where("auto", "==", true).get();
  const writes: ((b: WriteBatch) => void)[] = [];
  autos.docs.forEach((d) => {
    if (!months[d.data().month]) writes.push((b) => b.delete(d.ref));
  });
  for (const [month, v] of Object.entries(months)) {
    const id = `auto-${month}`;
    writes.push((b) => b.set(user.collection("base").doc(id), { id, month, sales: v.sales, orders: v.orders, auto: true, ord: 0 }));
  }
  await commitAll(writes);
  return added;
}

/** 売上の記録と在庫の足し引きを、1回の書き込みにまとめる */
async function applyStock(ref: DocumentReference, sale: OSale, stock: Record<string, number>, sign: 1 | -1, user: DocumentReference) {
  const b = db.batch();
  b.set(ref, sale);
  for (const [id, n] of Object.entries(stock)) {
    if (n) b.update(user.collection("prods").doc(id), { stock: FieldValue.increment(sign * n) });
  }
  await b.commit();
}

// ---- Square ----

async function syncSquare(uid: string, token: string, from: string, last: string | undefined): Promise<number> {
  const user = db.collection("users").doc(uid);
  const h = { "Square-Version": SQ_VERSION };
  // 商品の一覧
  const objs: SqCatalogObject[] = [];
  let cursor: string | undefined;
  do {
    const r = await call<{ objects?: SqCatalogObject[]; cursor?: string }>(
      `${SQ_API}/v2/catalog/list?types=ITEM${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      token,
      {},
      h,
    );
    objs.push(...(r.objects ?? []));
    cursor = r.cursor;
  } while (cursor);
  await saveExtItems(uid, "square", sqExtItems(objs));

  // 店舗
  const locs = await call<{ locations?: { id: string; status?: string }[] }>(`${SQ_API}/v2/locations`, token, {}, h);
  const ids = (locs.locations ?? []).filter((l) => l.status !== "INACTIVE").map((l) => l.id);
  if (!ids.length) return 0;

  // 完了した注文(前回の1時間前から。同じ注文は上書き)
  const start = last && last > from ? new Date(new Date(last).getTime() - 3600_000).toISOString() : from;
  const sales: OSale[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    let cur: string | undefined;
    do {
      const r = await call<{ orders?: SqOrder[]; cursor?: string }>(
        `${SQ_API}/v2/orders/search`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            location_ids: ids.slice(i, i + 10),
            limit: 500,
            cursor: cur,
            query: {
              filter: { state_filter: { states: ["COMPLETED"] }, date_time_filter: { closed_at: { start_at: start > from ? start : from } } },
              sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
            },
          }),
        },
        h,
      );
      sales.push(...(r.orders ?? []).map(sqOrderToSale));
      cur = r.cursor;
    } while (cur);
  }
  const col = user.collection("osales");
  await commitAll(sales.map((s) => (b: WriteBatch) => b.set(col.doc(s.id), s)));
  return sales.length;
}

// ---- まとめ ----

interface SyncDoc {
  from?: string;
  base?: { last?: string; error?: string | null; at?: string };
  square?: { last?: string; error?: string | null; at?: string };
}

async function runSync(uid: string): Promise<{ base?: number; square?: number }> {
  const keys = (await db.collection("keys").doc(uid).get()).data() as { base?: string; square?: string } | undefined;
  if (!keys?.base && !keys?.square) return {};
  const syncRef = db.collection("users").doc(uid).collection("settings").doc("sync");
  const sync = ((await syncRef.get()).data() ?? {}) as SyncDoc;
  const now = new Date().toISOString();
  const from = sync.from ?? now;
  if (!sync.from) await syncRef.set({ from }, { merge: true });
  const prods = (await db.collection("users").doc(uid).collection("prods").get()).docs.map((d) => {
    const p = d.data();
    return { id: d.id, pc: p.pc, baseItem: p.baseItem, sqItem: p.sqItem } as ProdLite;
  });
  const out: { base?: number; square?: number } = {};
  if (keys.base) {
    try {
      out.base = await syncBase(uid, keys.base.trim(), from, prods);
      await syncRef.set({ base: { last: now, error: null, at: now } }, { merge: true });
    } catch (e) {
      console.error("BASE", e);
      await syncRef.set({ base: { error: explain(e), at: now } }, { merge: true });
    }
  }
  if (keys.square) {
    try {
      out.square = await syncSquare(uid, keys.square.trim(), from, sync.square?.last);
      await syncRef.set({ square: { last: now, error: null, at: now } }, { merge: true });
    } catch (e) {
      console.error("Square", e);
      await syncRef.set({ square: { error: explain(e), at: now } }, { merge: true });
    }
  }
  return out;
}

/** 15分ごと */
export const syncShops = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Tokyo", timeoutSeconds: 300 }, async () => {
  const uid = await ownerUid();
  if (uid) await runSync(uid);
});

/** アプリの「今すぐ取り込む」 */
export const syncNow = onCall({ timeoutSeconds: 300 }, async (req) => {
  const uid = await ownerUid();
  if (!req.auth || !uid || req.auth.uid !== uid || req.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "店主のアカウントでログインしてください");
  }
  return runSync(uid);
});
