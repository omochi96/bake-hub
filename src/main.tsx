import { render } from "preact";
import { App } from "./app";
import { installSplash } from "./splash";
import "./styles.css";

const root = document.getElementById("root")!;
render(<App />, root);
installSplash();

// 公開版だけ、電波がなくても開けるようにする
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
