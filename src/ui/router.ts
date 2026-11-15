// どのタブ・どの詳細画面を開いているか
import { useEffect, useState } from "preact/hooks";

export type Tab = "home" | "mats" | "prods" | "card" | "cal" | "mkt" | "sales";

export const TABS: [Tab, string][] = [
  ["home", "ホーム"],
  ["mats", "材料"],
  ["prods", "商品"],
  ["card", "ルセット"],
  ["cal", "予定"],
  ["mkt", "イベント"],
  ["sales", "売上"],
];

interface Route {
  tab: Tab;
  /** 開いている商品の詳細 */
  prSel: string | null;
  /** 開いているイベントの記録画面 */
  evSel: string | null;
}

let route: Route = { tab: "home", prSel: null, evSel: null };
const ls = new Set<() => void>();

function set(r: Partial<Route>, scroll = true) {
  route = { ...route, ...r };
  ls.forEach((f) => f());
  if (scroll) window.scrollTo(0, 0);
}

export const go = {
  tab: (tab: Tab) => set({ tab }),
  prod: (id: string | null) => set({ tab: "prods", prSel: id }),
  event: (id: string | null) => set({ tab: "mkt", evSel: id }),
};

export function useRoute(): Route {
  const [, f] = useState(0);
  useEffect(() => {
    const cb = () => f((n) => n + 1);
    ls.add(cb);
    return () => ls.delete(cb);
  }, []);
  return route;
}
