// ルセット
import { useState } from "preact/hooks";
import { store, useData, usePhotos } from "../data/store";
import { batchCost, matLookup, productCost, unitCost, type MatLookup } from "../lib/calc";
import { n1, y2, yen } from "../lib/format";
import { matchName, usageCount } from "../lib/matcat";
import { isLowProd } from "../lib/stock";
import { GOODS, RECIPE_GENRES, type Material, type Product, type RecipeLine } from "../lib/types";
import { MatPicker } from "../ui/MatPicker";
import { NumField, PhotoTile } from "../ui/parts";
import { BakeList, ProduceForm } from "../ui/Produce";
import { AddProductRow } from "./Prods";

/** 編集中のルセット */
let editing: string | null = null;

function setLines(p: Product, lines: RecipeLine[]) {
  store.apply([{ t: "patch", col: "prods", id: p.id, patch: { lines } }]);
}

function LineRow({ p, i, mats, mat, use, autoFocus }: {
  p: Product;
  i: number;
  mats: Material[];
  mat: MatLookup;
  use: Record<string, number>;
  autoFocus?: boolean;
}) {
  const l = p.lines[i];
  const m = mat(l.m);
  return (
    <div class="line">
      <MatPicker
        value={l.m}
        mats={mats}
        use={use}
        autoFocus={autoFocus}
        onPick={(id) => setLines(p, p.lines.map((x, k) => (k === i ? { ...x, m: id } : x)))}
      />
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

function BakePanel({ p }: { p: Product }) {
  const d = useData();
  const recent = (d.bakes ?? []).filter((b) => b.prod === p.id).slice(0, 3);
  return (
    <>
      <ProduceForm p={p} />
      {recent.length > 0 && (
        <>
          <div class="rl-h">最近の製造記録</div>
          <BakeList bakes={recent} />
        </>
      )}
    </>
  );
}

function RecipeCard({ p, ed, onToggle }: { p: Product; ed: boolean; onToggle: () => void }) {
  const d = useData();
  const photos = usePhotos();
  const mat = matLookup(d.mats);
  const low = isLowProd(p);
  const use = usageCount(d.prods);
  // 「材料を追加」で増えた行だけ、入力欄にすぐ文字を打てるようにする
  const [added, setAdded] = useState(-1);
  return (
    <div class="card">
      <div class="ph" style={{ marginBottom: "8px" }}>
        <PhotoTile photo={photos[p.id]} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <span class={low ? "alert" : ""}>
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
            <LineRow key={i} p={p} i={i} mats={d.mats} mat={mat} use={use} autoFocus={i === added} />
          ))}
          <button
            onClick={() => {
              setAdded(p.lines.length);
              setLines(p, [...p.lines, { m: "", qty: 0 }]);
            }}
          >
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
        <BakePanel p={p} />
      ) : (
        <p class="mut">ルセットはまだありません。「編集」から材料を入れてください。</p>
      )}
    </div>
  );
}

/** 検索語(タブを移っても覚えておく。保存はしない) */
let query = "";

export function Recipes() {
  const d = useData();
  const [ed, setEd] = useState<string | null>(editing);
  const [q, setQ] = useState(query);
  const toggle = (id: string | null) => {
    editing = id;
    setEd(id);
  };
  const setQuery = (v: string) => {
    query = v;
    setQ(v);
  };
  // 雑貨はルセットがないので出さない
  const hits = d.prods.filter((p) => p.genre !== GOODS && matchName(p.name, q));
  // ジャンルごとの見出し(チャンククッキー → 焼き菓子 → グラノーラ → …)。どれにも当たらないものは最後に「その他」
  const known = RECIPE_GENRES as readonly string[];
  const groups = [...RECIPE_GENRES, "その他"]
    .map((g) => ({ g, ps: hits.filter((p) => (g === "その他" ? !known.includes(p.genre) : p.genre === g)) }))
    .filter((x) => x.ps.length);
  return (
    <>
      <h1>ルセット</h1>
      <div class="msearch">
        <input
          type="search"
          placeholder="商品を検索(例: 抹茶)"
          aria-label="商品を検索"
          value={q}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      {(!q || !hits.length) && (
        <div class="card">
          <h2>新しいルセットを作成</h2>
          <AddProductRow
            placeholder="ルセット名(商品名)"
            button="作成"
            emptyMsg="ルセット名を入力してください"
            genres={RECIPE_GENRES}
            onAdded={(id) => {
              setQuery("");
              toggle(id);
            }}
          />
        </div>
      )}
      {q && !hits.length && <p class="mut">「{q}」に当てはまる商品はありません。上で新しく作れます。</p>}
      {groups.map(({ g, ps }) => (
        <section key={g}>
          <h2 class="gh">{g}</h2>
          {ps.map((p) => (
            <RecipeCard key={p.id} p={p} ed={ed === p.id} onToggle={() => toggle(ed === p.id ? null : p.id)} />
          ))}
        </section>
      ))}
    </>
  );
}
