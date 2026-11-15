// ルセット
import { useState } from "preact/hooks";
import { store, useData, usePhotos } from "../data/store";
import { batchCost, doughWeight, lineCost, matLookup, productCost, type MatLookup } from "../lib/calc";
import { n1, uid, y2, yen } from "../lib/format";
import { sortProds } from "../lib/order";
import { matchName, usageCount } from "../lib/matcat";
import { isLowProd } from "../lib/stock";
import { GENRES, GOODS, RECIPE_GENRES, type Material, type Product, type RecipeLine, type RecipeSection } from "../lib/types";
import { MatPicker } from "../ui/MatPicker";
import { DelButton, NumField, PhotoTile, TextField, toast } from "../ui/parts";
import { BakeList, ProduceForm } from "../ui/Produce";
import { AddProductRow } from "./Prods";

/** 編集中のルセット */
let editing: string | null = null;

function setLines(p: Product, lines: RecipeLine[]) {
  store.apply([{ t: "patch", col: "prods", id: p.id, patch: { lines } }]);
}

/** 商品を選ぶ(生地・お菓子の行)。ジャンルごと、並び順で */
function ProdSelect({ value, prods, onPick }: { value: string; prods: Product[]; onPick: (id: string) => void }) {
  const groups = GENRES.map((g) => ({ g, ps: sortProds(prods.filter((x) => x.genre === g)) })).filter((x) => x.ps.length);
  return (
    <select value={value} aria-label="お菓子" onChange={(e) => onPick(e.currentTarget.value)}>
      <option value="">選んでください</option>
      {groups.map(({ g, ps }) => (
        <optgroup key={g} label={g}>
          {ps.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
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
  const d = useData();
  const l = p.lines[i];
  const m = mat(l.m);
  const put = (x: Partial<RecipeLine>) => setLines(p, p.lines.map((y, k) => (k === i ? { ...y, ...x } : y)));
  const others = d.prods.filter((x) => x.id !== p.id && (l.d ? x.genre !== GOODS && x.lines.length > 0 : true));
  const unit = l.d ? "g" : l.c ? "枚" : m?.unit;
  return (
    <div class={"line" + (l.d ? " dough" : l.c ? " piece" : "")}>
      {l.d !== undefined || l.c !== undefined ? (
        <div class="pick-prod">
          <small>{l.d !== undefined ? "生地" : "入れるお菓子"}</small>
          <ProdSelect value={(l.d ?? l.c)!} prods={others} onPick={(id) => put(l.d !== undefined ? { d: id } : { c: id })} />
        </div>
      ) : (
        <MatPicker value={l.m} mats={mats} use={use} autoFocus={autoFocus} onPick={(id) => put({ m: id })} />
      )}
      <NumField label="" value={l.qty} onCommit={(v) => put({ qty: v })} />
      <span class="c">
        {(m || l.d || l.c) && (
          <>
            {yen(lineCost(l, mat))}
            <br />
            {unit}
          </>
        )}
      </span>
      <button aria-label="行を削除" onClick={() => setLines(p, p.lines.filter((_, k) => k !== i))}>
        ×
      </button>
    </div>
  );
}

/** 行を足すボタン(材料・生地・お菓子) */
function AddLineButtons({ p, sec, onAdd }: { p: Product; sec?: string; onAdd: (i: number) => void }) {
  const add = (x: Partial<RecipeLine>) => {
    onAdd(p.lines.length);
    setLines(p, [...p.lines, { m: "", qty: 0, ...(sec ? { sec } : {}), ...x }]);
  };
  return (
    <div class="row addl">
      <button onClick={() => add({})}>＋材料</button>
      <button onClick={() => add({ d: "" })}>＋別の生地(g)</button>
      <button onClick={() => add({ c: "" })}>＋お菓子(枚)</button>
    </div>
  );
}

/** 枠の見出し(名前、トッピングかどうか、削除) */
function SectionHead({ p, sec }: { p: Product; sec: RecipeSection }) {
  const put = (x: Partial<RecipeSection>) =>
    store.apply([{ t: "patch", col: "prods", id: p.id, patch: { secs: (p.secs ?? []).map((y) => (y.id === sec.id ? { ...y, ...x } : y)) } }]);
  return (
    <div class="sec-head">
      <TextField label="" value={sec.name} placeholder="枠の名前" onCommit={(v) => put({ name: v.trim() || sec.name })} />
      <label class="opt">
        <input type="checkbox" checked={!!sec.opt} onChange={(e) => put({ opt: e.currentTarget.checked })} />
        トッピング(作るときに選ぶ)
      </label>
      <DelButton
        label="枠を削除"
        armedLabel="中の行ごと削除"
        onConfirm={() =>
          store.apply([
            {
              t: "patch",
              col: "prods",
              id: p.id,
              patch: { secs: (p.secs ?? []).filter((y) => y.id !== sec.id), lines: p.lines.filter((l) => l.sec !== sec.id) },
            },
          ])
        }
      />
    </div>
  );
}

/** 枠を足す(名前を入れて) */
function AddSection({ p }: { p: Product }) {
  const [name, setName] = useState("");
  const add = () => {
    const v = name.trim();
    if (!v) return toast("枠の名前を入れてください(例: メレンゲ、生クリーム)");
    const opt = /クリーム|フロスティング|トッピング|ソース|アイシング/.test(v) && !/メレンゲ/.test(v);
    store.apply([{ t: "patch", col: "prods", id: p.id, patch: { secs: [...(p.secs ?? []), { id: uid(), name: v, ...(opt ? { opt } : {}) }] } }]);
    setName("");
  };
  return (
    <div class="row add-sec">
      <input placeholder="新しい枠(例: メレンゲ、チーズフロスティング)" value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <button onClick={add}>枠を追加</button>
    </div>
  );
}

/** ルセットの編集(本体の行と、枠ごとの行) */
function RecipeEditor({ p }: { p: Product }) {
  const d = useData();
  const mat = matLookup(d.mats, d.prods);
  const use = usageCount(d.prods);
  // 行を足したら、その行の入力欄にすぐ文字を打てるようにする
  const [added, setAdded] = useState(-1);
  const rows = (sec?: string) =>
    p.lines.map((l, i) => ({ l, i })).filter(({ l }) => (l.sec ?? "") === (sec ?? "") || (!sec && l.sec && !p.secs?.some((x) => x.id === l.sec)));
  const block = (sec?: string) =>
    rows(sec).map(({ i }) => <LineRow key={i} p={p} i={i} mats={d.mats} mat={mat} use={use} autoFocus={i === added} />);
  const autoW = doughWeight({ ...p, dough: undefined }, mat);
  return (
    <>
      <div class="grid">
        <NumField
          label="1回の仕込み数(枚・個・箱)"
          value={p.yield}
          onCommit={(v) => store.apply([{ t: "patch", col: "prods", id: p.id, patch: { yield: v } }])}
        />
        <NumField
          label="1回分の生地の重さ(g)"
          value={p.dough ?? 0}
          blankZero
          placeholder={autoW ? `自動: ${n1(autoW)}g` : "空なら自動"}
          onCommit={(v) => store.apply([{ t: "patch", col: "prods", id: p.id, patch: { dough: v } }])}
        />
      </div>
      {block()}
      <AddLineButtons p={p} onAdd={setAdded} />
      {(p.secs ?? []).map((sec) => (
        <div class={"sec" + (sec.opt ? " opt" : "")} key={sec.id}>
          <SectionHead p={p} sec={sec} />
          {block(sec.id)}
          <AddLineButtons p={p} sec={sec.id} onAdd={setAdded} />
        </div>
      ))}
      <AddSection p={p} />
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
      <p class="mut">
        「別の生地」は、ほかのルセットの生地を重さで使います(その材料を割合で使ったことになります)。「お菓子」はBAKE BOXなどの詰め合わせ用で、作るとそのお菓子の在庫が減ります。トッピングの枠は原価に含めず、作るときにオンにした分だけ材料を使います。生地の重さは、ほかのルセットでこの生地を使うときの計算に使います。
      </p>
    </>
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
  const photos = usePhotos();
  const low = isLowProd(p);
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
        <RecipeEditor p={p} />
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
    .map((g) => ({ g, ps: sortProds(hits.filter((p) => (g === "その他" ? !known.includes(p.genre) : p.genre === g))) }))
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
