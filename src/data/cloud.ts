// Firebase(ログインと、Firestoreへの保存・同期)
// 保存の形は SPEC.md 11章。users/<uid>/<種類>/<id> に1件ずつ。
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  increment,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
  type WriteBatch,
} from "firebase/firestore";
import type { AppData, Config } from "../lib/types";
import type { Photos } from "./seed";
import type { Col, Op, SyncState } from "./store";

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** Firebaseの設定が入っているか(入っていなければ、端末内だけで動く) */
export const cloudConfigured = !!config.apiKey && !!config.projectId;

export type AuthState = "loading" | "signed-out" | "signed-in" | "denied";

export const COLS: Col[] = ["mats", "prods", "sched", "events", "base"];

export interface CloudHandlers {
  onAuth(state: AuthState, email?: string): void;
  onCol(col: Col, items: unknown[]): void;
  onCfg(cfg: Config | null): void;
  onPhotos(p: Photos): void;
  onSync(s: SyncState): void;
  /** 初めてログインしたとき(クラウドが空) */
  onEmpty(): void;
}

let auth: Auth;
let db: Firestore;
let uid = "";
let unsubs: (() => void)[] = [];

const userCol = (c: string) => collection(db, "users", uid, c);
const userDoc = (c: string, id: string) => doc(db, "users", uid, c, id);

/** 並び順を残すための番号(Firestoreには順番がないため) */
function sortByOrd(snap: QuerySnapshot<DocumentData>): unknown[] {
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    .map(({ ord: _o, ...rest }) => rest);
}

export function startCloud(h: CloudHandlers) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    // 電波がなくても読み書きでき、つながったら同期する
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  getRedirectResult(auth).catch(() => {});

  onAuthStateChanged(auth, (user) => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (!user) {
      uid = "";
      h.onAuth("signed-out");
      return;
    }
    uid = user.uid;
    h.onAuth("signed-in", user.email ?? "");
    listen(h);
  });
}

function listen(h: CloudHandlers) {
  const pending = new Map<string, boolean>();
  const cached = new Map<string, boolean>();
  const report = () => {
    if ([...pending.values()].some(Boolean)) h.onSync(navigator.onLine ? "saving" : "offline");
    else if ([...cached.values()].some(Boolean) || !navigator.onLine) h.onSync("offline");
    else h.onSync("synced");
  };
  const onErr = (e: { code?: string }) => {
    if (e.code === "permission-denied") h.onAuth("denied", auth.currentUser?.email ?? "");
    else h.onSync("error");
  };
  const watch = (name: string, f: (s: QuerySnapshot<DocumentData>) => void) => {
    unsubs.push(
      onSnapshot(
        userCol(name),
        { includeMetadataChanges: true },
        (s) => {
          pending.set(name, s.metadata.hasPendingWrites);
          cached.set(name, s.metadata.fromCache);
          f(s);
          report();
        },
        onErr,
      ),
    );
  };

  let checkedEmpty = false;
  for (const c of COLS) watch(c, (s) => h.onCol(c, sortByOrd(s)));
  watch("photos", (s) => {
    const p: Photos = {};
    s.docs.forEach((d) => (p[d.id] = d.data().v));
    h.onPhotos(p);
  });
  watch("settings", (s) => {
    const cfg = s.docs.find((d) => d.id === "cfg");
    if (cfg) h.onCfg(cfg.data() as Config);
    // サーバーに確かめたうえで設定がなければ、初めての利用
    else if (!s.metadata.fromCache && !checkedEmpty) {
      checkedEmpty = true;
      h.onEmpty();
    } else h.onCfg(null);
  });
  const net = () => report();
  window.addEventListener("online", net);
  window.addEventListener("offline", net);
  unsubs.push(() => {
    window.removeEventListener("online", net);
    window.removeEventListener("offline", net);
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function signIn() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  // ホーム画面に追加したアプリの中では、別窓が開けないので画面ごと移動する
  if (isStandalone()) return signInWithRedirect(auth, p);
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, p);
    } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") throw e;
  }
}

export function signOut() {
  return fbSignOut(auth);
}

// ---- 書き込み ----

/** Op を Firestore の書き込みに変換する。電波がなくても、この端末に先に保存される */
function addToBatch(b: WriteBatch, op: Op) {
  switch (op.t) {
    case "add":
      b.set(userDoc(op.col, op.item.id), { ...op.item, ord: op.first ? -Date.now() : Date.now() });
      break;
    case "patch":
      b.update(userDoc(op.col, op.id), op.patch);
      break;
    case "del":
      b.delete(userDoc(op.col, op.id));
      break;
    case "incr":
      b.update(userDoc(op.col, op.id), { [op.field]: increment(op.delta) });
      break;
    case "cfg":
      b.set(userDoc("settings", "cfg"), op.patch, { merge: true });
      break;
    case "tg":
      b.set(userDoc("settings", "cfg"), { tg: op.patch }, { merge: true });
      break;
    case "photo":
      if (op.value) b.set(userDoc("photos", op.id), { v: op.value });
      else b.delete(userDoc("photos", op.id));
      break;
  }
}

export function writeOps(ops: Op[], onError: (e: unknown) => void) {
  if (!uid) return;
  const b = writeBatch(db);
  ops.forEach((op) => addToBatch(b, op));
  // 完了を待たない(オフラインでは、つながるまで完了しないため)
  b.commit().catch(onError);
}

/** 全体を置き換える(初回の初期データ、JSONの読み込み) */
export async function replaceAll(data: AppData, photos: Photos) {
  if (!uid) return;
  const writes: ((b: WriteBatch) => void)[] = [];
  for (const c of [...COLS, "photos"]) {
    const snap = await getDocs(userCol(c));
    snap.docs.forEach((d) => writes.push((b) => b.delete(d.ref)));
  }
  for (const c of COLS) {
    (data[c] as { id: string }[]).forEach((item, i) => writes.push((b) => b.set(userDoc(c, item.id), { ...item, ord: i })));
  }
  for (const [id, v] of Object.entries(photos)) writes.push((b) => b.set(userDoc("photos", id), { v }));
  const flags = { seed1: data.seed1 ?? null, seed2: data.seed2 ?? null };
  writes.push((b) => b.set(userDoc("settings", "cfg"), { ...data.cfg, ...flags }));
  // 1回の書き込みは500件まで
  for (let i = 0; i < writes.length; i += 400) {
    const b = writeBatch(db);
    writes.slice(i, i + 400).forEach((w) => w(b));
    await b.commit();
  }
}

