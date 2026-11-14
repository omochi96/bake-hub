import logoMark from "./assets/logo-mark.jpg";
import wordmark from "./assets/wordmark.png";
import { useStore } from "./data/store";
import type { SyncState } from "./data/store";
import { Denied, Login } from "./ui/Login";
import { Toast } from "./ui/parts";
import { go, TABS, useRoute } from "./ui/router";
import { Events } from "./views/Events";
import { Home } from "./views/Home";
import { Mats } from "./views/Mats";
import { Prods } from "./views/Prods";
import { Recipes } from "./views/Recipes";
import { Sales } from "./views/Sales";

const VIEWS = { home: Home, mats: Mats, prods: Prods, card: Recipes, mkt: Events, sales: Sales };

const SYNC_TEXT: Record<SyncState, string> = {
  local: "この端末のみ保存",
  saving: "保存中…",
  synced: "同期済み",
  offline: "オフライン(この端末に保存中)",
  error: "同期に失敗(この端末には保存済み)",
};

export function App() {
  const r = useRoute();
  const st = useStore();
  if (st.auth === "loading") return <main />;
  if (st.auth === "signed-out") return <Login />;
  if (st.auth === "denied") return <Denied email={st.email} />;
  if (!st.ready) return <main />;
  const View = VIEWS[r.tab];
  return (
    <>
      <main id="app">
        <header class="top">
          <img src={logoMark} alt="" />
          <div>
            <img class="wm" src={wordmark} alt="BAKE MANIA" />
            <small id="sync">{SYNC_TEXT[st.sync]}</small>
          </div>
        </header>
        <View />
      </main>
      <nav id="nav">
        {TABS.map(([k, label]) => (
          <button key={k} aria-current={k === r.tab ? "true" : "false"} onClick={() => go.tab(k)}>
            {label}
          </button>
        ))}
      </nav>
      <Toast />
    </>
  );
}
