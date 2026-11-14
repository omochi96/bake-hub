// ログイン画面と、使えないアカウントのときの画面
import { useState } from "preact/hooks";
import logoMark from "../assets/logo-mark.jpg";
import wordmark from "../assets/wordmark.png";
import { signIn, signOut } from "../data/cloud";

function Frame(p: { children: preact.ComponentChildren }) {
  return (
    <main class="login">
      <img class="login-logo" src={logoMark} alt="" />
      <div class="login-wm">
        <img src={wordmark} alt="BAKE MANIA" />
      </div>
      <p class="mut" style={{ margin: "0 0 20px" }}>
        BAKE HUB 原価・在庫管理
      </p>
      {p.children}
    </main>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Frame>
      <button
        class="pri"
        style={{ width: "100%", maxWidth: "320px" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await signIn();
          } catch {
            setErr("ログインできませんでした。電波の状態を確かめて、もう一度お試しください。");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "ログイン中…" : "Googleでログイン"}
      </button>
      {err && <p class="note" style={{ marginTop: "16px" }}>{err}</p>}
    </Frame>
  );
}

export function Denied({ email }: { email: string }) {
  return (
    <Frame>
      <p class="note">{email} では使えません。お店のGoogleアカウントでログインしてください。</p>
      <button onClick={() => signOut()}>別のアカウントでログイン</button>
    </Frame>
  );
}
