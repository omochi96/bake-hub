// 画面で共通に使う部品。
// 入力欄は自分の中に入力中の文字を持ち、確定(フォーカスが外れる・Enter)したときだけ保存する。
// 画面全体を作り直さないので、入力の途中でフォーカスが外れない。
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { num } from "../lib/format";
import { photoUrl } from "../data/photos";

interface FieldProps {
  label: ComponentChildren;
  cls?: string;
}

export function NumField(
  p: FieldProps & { value: number; onCommit: (v: number) => void; inputMode?: "decimal" | "numeric"; placeholder?: string; blankZero?: boolean },
) {
  const show = (v: number) => (p.blankZero && !v ? "" : String(v ?? ""));
  const [s, setS] = useState(show(p.value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setS(show(p.value));
  }, [p.value]);
  return (
    <label class={p.cls}>
      {p.label}
      <input
        type="number"
        inputMode={p.inputMode ?? "decimal"}
        min="0"
        step="any"
        placeholder={p.placeholder}
        value={s}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onInput={(e) => setS(e.currentTarget.value)}
        onChange={(e) => {
          const v = num(e.currentTarget.value);
          if (v !== p.value) p.onCommit(v);
        }}
      />
    </label>
  );
}

export function TextField(p: FieldProps & { value: string; onCommit: (v: string) => void; type?: "text" | "date" | "time" | "month"; placeholder?: string }) {
  const [s, setS] = useState(p.value ?? "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setS(p.value ?? "");
  }, [p.value]);
  return (
    <label class={p.cls}>
      {p.label}
      <input
        type={(p.type ?? "text") as "text"}
        placeholder={p.placeholder}
        value={s}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onInput={(e) => setS(e.currentTarget.value)}
        onChange={(e) => {
          if (e.currentTarget.value !== p.value) p.onCommit(e.currentTarget.value);
        }}
      />
    </label>
  );
}

export function SelectField(p: FieldProps & { value: string; options: readonly string[]; onCommit: (v: string) => void }) {
  return (
    <label class={p.cls}>
      {p.label}
      <select value={p.value} onChange={(e) => p.onCommit(e.currentTarget.value)}>
        {p.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/** 2回押すと削除。1回目で文言が変わり、4秒たつか別の場所を押すと戻る */
export function DelButton(p: { label?: string; armedLabel?: string; onConfirm: () => void; cls?: string }) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    const off = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setArmed(false);
    };
    document.addEventListener("pointerdown", off, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", off, true);
    };
  }, [armed]);
  return (
    <button
      ref={ref}
      class={p.cls}
      onClick={() => {
        if (armed) {
          setArmed(false);
          p.onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? p.armedLabel ?? "もう一度押すと削除" : p.label ?? "削除"}
    </button>
  );
}

/** 商品写真の小さいタイル */
export function PhotoTile(p: { photo?: string; size: number; label?: string }) {
  const u = photoUrl(p.photo);
  return (
    <div class="pic cover" style={{ width: p.size + "px", height: p.size + "px" }}>
      {u ? <img src={u} alt="" /> : <span class="mut">{p.label ?? "写真"}</span>}
    </div>
  );
}

// ---- お知らせ(画面下に少しだけ出る文) ----
let showToast: (m: string) => void = () => {};
export function toast(m: string) {
  showToast(m);
}
export function Toast() {
  const [m, setM] = useState("");
  const [on, setOn] = useState(false);
  const t = useRef<number>(0);
  useEffect(() => {
    showToast = (msg) => {
      setM(msg);
      setOn(true);
      clearTimeout(t.current);
      t.current = window.setTimeout(() => setOn(false), 2400);
    };
  }, []);
  return (
    <div id="toast" role="status" class={on ? "on" : ""}>
      {m}
    </div>
  );
}
