// 起動時の演出(SPEC.md 7章)。旧版の splash() と同じ動き。
// 丸いアイコンが左から右へ、2つのアーチを描いて跳ねながら通過する(傾けない、1.6秒)。
// 位置は放物線を60点でサンプリングし、Web Animations API で直線補間する。
// 右へ抜ける頃に、ホームが中央から広がって現れる(0.7秒)。
import logoMark from "./assets/logo-mark.jpg";

const DUR = 1600;

/** 60点のキーフレーム。x は -70vw → 70vw、y は2つのアーチ(高さ170px) */
export function splashFrames(): Keyframe[] {
  const k: Keyframe[] = [];
  for (let i = 0; i <= 60; i++) {
    const p = i / 60;
    const u = (p * 2) % 1;
    k.push({ transform: `translate3d(${-70 + 140 * p}vw,${40 - 170 * 4 * u * (1 - u)}px,0)` });
  }
  return k;
}

export function splash() {
  document.getElementById("splash")?.remove();
  const s = document.createElement("div");
  s.id = "splash";
  s.setAttribute("aria-hidden", "true");
  const sx = document.createElement("div");
  sx.id = "sx";
  const im = document.createElement("img");
  im.alt = "";
  im.src = logoMark;
  sx.appendChild(im);
  s.appendChild(sx);
  document.body.appendChild(s);

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !sx.animate) {
    setTimeout(() => s.remove(), 700);
    return;
  }
  const k = splashFrames();
  sx.style.transform = k[0].transform as string;
  let go = false;
  const start = () => {
    if (go) return;
    go = true;
    sx.animate(k, { duration: DUR, easing: "linear", fill: "both" });
    s.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: DUR + 100, fill: "both" });
    for (const e of [document.querySelector("main"), document.querySelector("nav")]) {
      e?.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], {
        duration: 700,
        delay: DUR * 0.78,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "backwards",
      });
    }
    setTimeout(() => s.remove(), DUR + 300);
  };
  // 画像の読み込みを待ってから始める(最長0.4秒)
  (im.decode ? im.decode() : Promise.resolve()).then(start, start);
  setTimeout(start, 400);
}

/** 起動時と、非表示から1分以上たって戻ったときに実行 */
export function installSplash() {
  splash();
  let hid = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hid = Date.now();
    else if (hid && Date.now() - hid > 60000) {
      hid = 0;
      splash();
    }
  });
}
