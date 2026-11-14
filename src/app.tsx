import logoMark from "./assets/logo-mark.jpg";
import wordmark from "./assets/wordmark.png";
import { Toast } from "./ui/parts";
import { go, TABS, useRoute } from "./ui/router";
import { Events } from "./views/Events";
import { Home } from "./views/Home";
import { Mats } from "./views/Mats";
import { Prods } from "./views/Prods";
import { Recipes } from "./views/Recipes";
import { Sales } from "./views/Sales";

const VIEWS = { home: Home, mats: Mats, prods: Prods, card: Recipes, mkt: Events, sales: Sales };

export function App() {
  const r = useRoute();
  const View = VIEWS[r.tab];
  return (
    <>
      <main id="app">
        <header class="top">
          <img src={logoMark} alt="" />
          <div>
            <img class="wm" src={wordmark} alt="BAKE MANIA" />
            <small id="sync">この端末のみ保存</small>
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
