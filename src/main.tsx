import { render } from "preact";
import { App } from "./app";
import { installSplash } from "./splash";
import "./styles.css";

const root = document.getElementById("root")!;
render(<App />, root);
installSplash();

// 公開版だけ、電波がなくても開けるようにする
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // 新しい版を公開したら、次に開いたときに自動で切り替える
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
