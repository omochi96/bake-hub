// 材料の予測入力(ルセットの材料、商品の包装資材で使う)
import { useRef, useState } from "preact/hooks";
import { store } from "../data/store";
import { unitCost } from "../lib/calc";
import { uid, y2 } from "../lib/format";
import { matCat, suggestMats } from "../lib/matcat";
import type { Material } from "../lib/types";
import { toast } from "./parts";

/**
 * 材料の予測入力。文字を入れると、名前に合う材料がよく使う順に出る。
 * 見つからなければ、その名前で新しい材料を作れる。
 */
export function MatPicker({ value, mats, use, autoFocus, onPick, prefer, fresh, placeholder }: {
  value: string;
  mats: Material[];
  use: Record<string, number>;
  autoFocus?: boolean;
  onPick: (id: string) => void;
  /** 先に出したい材料(包装資材なら包材) */
  prefer?: (m: Material) => boolean;
  /** 新しく追加するときの初期値 */
  fresh?: Partial<Material>;
  placeholder?: string;
}) {
  const cur = mats.find((m) => m.id === value);
  const [text, setText] = useState(cur?.name ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // 選んでいる材料の名前(閉じているとき)か、入力中の文字(開いているとき)
  const shown = open ? text : cur?.name ?? "";
  const list = prefer
    ? suggestMats(mats, text, use, 999)
        .map((m, i) => ({ m, i, p: prefer(m) ? 0 : 1 }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map((x) => x.m)
        .slice(0, 8)
    : suggestMats(mats, text, use);
  const exact = mats.some((m) => m.name.trim() === text.trim());
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    ref.current?.blur();
  };
  const create = () => {
    const name = text.trim();
    if (!name) return;
    const id = uid();
    store.apply([
      { t: "add", col: "mats", first: false, item: { id, name, unit: "g", packQty: 1000, packPrice: 0, qty: 0, min: 0, ...fresh } },
    ]);
    pick(id);
    toast(`「${name}」を材料に追加しました。材料タブで価格を入れてください`);
  };
  return (
    <div class="picker">
      <input
        ref={ref}
        type="text"
        enterKeyHint="done"
        placeholder={placeholder ?? "材料名を入力"}
        aria-label="材料"
        autoFocus={autoFocus}
        value={shown}
        onFocus={(e) => {
          setText(cur?.name ?? "");
          setOpen(true);
          e.currentTarget.select();
        }}
        onBlur={() => setOpen(false)}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (list.length) pick(list[0].id);
            else create();
          } else if (e.key === "Escape") ref.current?.blur();
        }}
      />
      {open && (
        // 押した瞬間に入力欄のフォーカスが外れて一覧が消えないよう、pointerdown を止める
        <div class="sugg" role="listbox" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
          {list.map((m) => (
            <button key={m.id} role="option" aria-selected={m.id === value} onClick={() => pick(m.id)}>
              <span>{m.name}</span>
              <small>
                {matCat(m)} ・ {y2(unitCost(m))}/{m.unit}
              </small>
            </button>
          ))}
          {text.trim() && !exact && (
            <button class="add" onClick={create}>
              ＋「{text.trim()}」を新しい材料として追加
            </button>
          )}
          {!list.length && !text.trim() && <p class="mut">材料がまだありません</p>}
        </div>
      )}
    </div>
  );
}

