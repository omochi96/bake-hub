// ルセット
import { useState } from "preact/hooks";
import { store, useData, usePhotos } from "../data/store";
import { batchCost, matLookup, productCost, unitCost, type MatLookup } from "../lib/calc";
import { n1, num, y2, yen } from "../lib/format";
import { bake, bakeNeeds, isLowProd } from "../lib/stock";
import type { Material, Product, RecipeLine } from "../lib/types";
import { NumField, PhotoTile, toast } from "../ui/parts";
import { AddProductRow } from "./Prods";

/** 焼きたい数(タブを移っても覚えておく。保存はしない) */
const RN: Record<string, number> = {};
/** 編集中のルセット */
let editing: string | null = null;

function setLines(p: Product, lines: RecipeLine[]) {
  store.apply([{ t: "patch", col: "prods", id: p.id, patch: { lines } }]);
}

function LineRow({ p, i, mats, mat }: { p: Product; i: number; mats: Material[]; mat: MatLookup }) {
  const l = p.lines[i];
  const m = mat(l.m);
  return (
    <div class="line">
      <select
        value={l.m}
        onChange={(e) => setLines(p, p.lines.map((x, k) => (k === i ? { ...x, m: e.currentTarget.value } : x)))}
      >
        {mats.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <NumField
        label=""
        value={l.qty}
        onCommit={(v) => setLines(p, p.lines.map((x, k) => (k === i ? { ...x, qty: v } : x)))}
      />
      <span class="c">
        {m && (
          <>
            {yen(unitCost(m) * l.qty)}
            <br />
            {m.unit}
          </>
        )}
      </span>
      <button aria-label="材料を削除" onClick={() => setLines(p, p.lines.filter((_, k) => k !== i))}>
        ×
      </button>
    </div>
  );
}

function BakePanel({ p, mat }: { p: Product; mat: MatLookup }) {
  const [n, setN] = useState(RN[p.id] ?? p.yield);
  const needs = bakeNeeds(p, n, mat);
  return (
    <>
      <label class="mut">
        焼きたい数
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="any"
          value={n}
          style={{ fontSize: "20px" }}
          onInput={(e) => {
            const v = num(e.currentTarget.value);
            RN[p.id] = v;
            setN(v);
          }}
        />
      </label>
      <div>
        {needs.map((x, k) => (
          <div class="rl" key={k}>
            <span>{x.mat.name}</span>
            {x.short && <em>在庫不足</em>}
            <b>
              {n1(x.need)}
              {x.mat.unit}
            </b>
          </div>
        ))}
      </div>
      <button
        class="pri"
        style={{ marginTop: "10px" }}
        onClick={() => {
          const r = bake(p, n, mat);
          if (!r.ok) {
            if (r.reason === "no-count") return toast("焼きたい数を入力してください");
            return toast("在庫が足りません: " + r.shortages.join("、"));
          }
          store.apply([
            ...Object.entries(r.matQty).map(([id, q]) => ({
              t: "incr" as const,
              col: "mats" as const,
              id,
              field: "qty",
              delta: q - mat(id)!.qty,
            })),
            { t: "incr", col: "prods", id: p.id, field: "stock", delta: n },
          ]);
          toast(`${p.name} ${n1(n)}個分を作成し、在庫を更新しました`);
        }}
      >
        作成して在庫を更新
      </button>
    </>
  );
}

function RecipeCard({ p, ed, onToggle }: { p: Product; ed: boolean; onToggle: () => void }) {
  const d = useData();
  const photos = usePhotos();
  const mat = matLookup(d.mats);
  const low = isLowProd(p);
  return (
    <div class="card">
      <div class="ph" style={{ marginBottom: "8px" }}>
        <PhotoTile photo={photos[p.id]} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <span class={low ? "neg" : ""}>
            <b>現在の在庫 {n1(p.stock)}</b>
          </span>{" "}
          <small>{p.genre}</small>
        </div>
        <button onClick={onToggle}>{ed ? "閉じる" : "編集"}</button>
      </div>
      {ed ? (
        <>
          <div class="grid">
            <NumField
              label="1回の仕込み数(枚・個)"
              value={p.yield}
              onCommit={(v) => store.apply([{ t: "patch", col: "prods", id: p.id, patch: { yield: v } }])}
            />
          </div>
          {p.lines.map((_, i) => (
            <LineRow key={i} p={p} i={i} mats={d.mats} mat={mat} />
          ))}
          <button disabled={!d.mats.length} onClick={() => setLines(p, [...p.lines, { m: d.mats[0].id, qty: 0 }])}>
            材料を追加
          </button>
          <div class="res two">
            <div>
              <span>1回分の材料費</span>
              <b>{yen(batchCost(p, mat))}</b>
            </div>
            <div>
              <span>1個あたりの材料原価</span>
              <b>{y2(productCost(p, mat).mat)}</b>
            </div>
          </div>
        </>
      ) : p.lines.length ? (
        <BakePanel p={p} mat={mat} />
      ) : (
        <p class="mut">ルセットはまだありません。「編集」から材料を入れてください。</p>
      )}
    </div>
  );
}

export function Recipes() {
  const d = useData();
  const [ed, setEd] = useState<string | null>(editing);
  const toggle = (id: string | null) => {
    editing = id;
    setEd(id);
  };
  return (
    <>
      <h1>ルセット</h1>
      <div class="card">
        <h2>新しいルセットを作成</h2>
        <AddProductRow
          placeholder="ルセット名(商品名)"
          button="作成"
          emptyMsg="ルセット名を入力してください"
          onAdded={(id) => toggle(id)}
        />
      </div>
      {d.prods.map((p) => (
        <RecipeCard key={p.id} p={p} ed={ed === p.id} onToggle={() => toggle(ed === p.id ? null : p.id)} />
      ))}
    </>
  );
}
