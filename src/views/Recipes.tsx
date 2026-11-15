// ルセット
import { useRef, useState } from "preact/hooks";
import { store, useData, usePhotos } from "../data/store";
import { batchCost, matLookup, productCost, unitCost, type MatLookup } from "../lib/calc";
import { n1, num, uid, y2, yen } from "../lib/format";
import { matCat, matchName, suggestMats, usageCount } from "../lib/matcat";
import { bake, bakeNeeds, isLowProd } from "../lib/stock";
import { GOODS, RECIPE_GENRES, type Material, type Product, type RecipeLine } from "../lib/types";
import { NumField, PhotoTile, toast } from "../ui/parts";
import { AddProductRow } from "./Prods";

/** 焼きたい数(タブを移っても覚えておく。保存はしない) */
const RN: Record<string, number> = {};
/** 編集中のルセット */
let editing: string | null = null;

function setLines(p: Product, lines: RecipeLine[]) {
  store.apply([{ t: "patch", col: "prods", id: p.id, patch: { lines } }]);
}

/**
 * 材料の予測入力。文字を入れると、名前に合う材料がよく使う順に出る。
 * 見つからなければ、その名前で新しい材料を作れる。
 */
function MatPicker({ value, mats, use, autoFocus, onPick }: {
  value: string;
  mats: Material[];
  use: Record<string, number>;
  autoFocus?: boolean;
  onPick: (id: string) => void;
}) {
  const cur = mats.find((m) => m.id === value);
  const [text, setText] = useState(cur?.name ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // 選んでいる材料の名前(閉じているとき)か、入力中の文字(開いているとき)
  const shown = open ? text : cur?.name ?? "";
  const list = suggestMats(mats, text, use);
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
      { t: "add", col: "mats", first: false, item: { id, name, unit: "g", packQty: 1000, packPrice: 0, qty: 0, min: 0 } },
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
        placeholder="材料名を入力"
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
        <BakePanel p={p} mat={mat} />
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
