// 新しい版の自動切り替え(SPEC.md 11章「公開(PWA)」)
// アプリに戻ってきたとき(と、開いているあいだ30分ごと)に、公開中の版を確かめる。
// 新しい版があれば、入力の途中でなければその場で読み込み直す。入力の途中なら「押して切り替え」を出す。
import { useEffect, useState } from "preact/hooks";

/** いま動いている版(組み立て済みファイルの名前。開発中は "" で、確かめない) */
function currentVersion(): string {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return s ? new URL(s.src).pathname : "";
}

/** 公開中の版。読めなければ "" */
async function latestVersion(): Promise<string> {
  try {
    const res = await fetch("/?v=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return "";
    const m = (await res.text()).match(/\/assets\/index-[^"']+\.js/);
    return m ? m[0] : "";
  } catch {
    return "";
  }
}

let ready = false;
const ls = new Set<(v: boolean) => void>();
function setReady(v: boolean) {
  ready = v;
  ls.forEach((f) => f(v));
}

/** 新しい版を読み込む */
export function applyUpdate() {
  location.reload();
}

/**
 * いま切り替えてよいか。入力欄にカーソルがある、またはイベントの記録画面(保存前の入力が消えるため)なら待つ
 * isBusy はアプリから渡す(画面の状態を知っているのはアプリ側のため)
 */
function canSwitchNow(isBusy: () => boolean): boolean {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  return !isBusy();
}

let last = 0;
async function check(isBusy: () => boolean) {
  const cur = currentVersion();
  if (!cur || document.hidden) return;
  // 続けて何度も確かめない(30秒あける)
  if (Date.now() - last < 30_000) return;
  last = Date.now();
  const next = await latestVersion();
  if (!next || next === cur) return;
  if (canSwitchNow(isBusy)) applyUpdate();
  else setReady(true);
}

/** 起動時に一度だけ呼ぶ */
export function installAutoUpdate(isBusy: () => boolean) {
  const run = () => void check(isBusy);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) run();
  });
  window.addEventListener("pageshow", run);
  window.addEventListener("focus", run);
  window.addEventListener("online", run);
  setInterval(run, 30 * 60_000);
}

/** 「新しい版があります」を出すかどうか */
export function useUpdateReady(): boolean {
  const [v, setV] = useState(ready);
  useEffect(() => {
    ls.add(setV);
    return () => {
      ls.delete(setV);
    };
  }, []);
  return v;
}
