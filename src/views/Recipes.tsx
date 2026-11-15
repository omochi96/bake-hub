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

/** 開いているルセットと、編集中のルセット(タブを移っても覚えておく。保存はしない) */
let opened: string | null = null;
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
      {(p.secs?.length ?? 0) > 0 && (
        <label class="line-sec">
          入れる枠
          <select
            value={l.sec && p.secs!.some((x) => x.id === l.sec) ? l.sec : ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setLines(p, p.lines.map((y, k) => (k === i ? (v ? { ...y, sec: v } : (({ sec: _s, ...rest }) => rest)(y)) : y)));
            }}
          >
            <option value="">本体</option>
            {p.secs!.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
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

/** よく使う生地・パーツの名前(押すだけで枠ができる) */
const PART_PRESETS = ["タルト生地", "アパレイユ", "メレンゲ", "クッキー生地", "生クリーム", "チーズフロスティング"];

/** トッピング(作るときにオンオフ)らしい名前か */
const looksTopping = (v: string) => /クリーム|フロスティング|トッピング|ソース|アイシング|ガナッシュ/.test(v) && !/メレンゲ|アパレイユ|生地/.test(v);

/** 生地・パーツを分ける(枠を足す)。ルセットを作るときから使えるよう、編集画面の上に置く */
function PartsBar({ p }: { p: Product }) {
  const [name, setName] = useState("");
  const have = new Set((p.secs ?? []).map((x) => x.name));
  const add = (v: string) => {
    v = v.trim();
    if (!v) return toast("名前を入れてください(例: タルト生地、アパレイユ)");
    if (have.has(v)) return toast(`「${v}」はもうあります`);
    const opt = looksTopping(v);
    store.apply([{ t: "patch", col: "prods", id: p.id, patch: { secs: [...(p.secs ?? []), { id: uid(), name: v, ...(opt ? { opt } : {}) }] } }]);
    setName("");
    toast(opt ? `「${v}」をトッピングとして足しました(作るときにオンオフ)` : `「${v}」の枠を足しました`);
  };
  return (
    <div class="parts">
      <div class="parts-h">生地・パーツを分ける</div>
      <div class="parts-chips">
        {PART_PRESETS.filter((x) => !have.has(x)).map((x) => (
          <button key={x} class={looksTopping(x) ? "top" : ""} onClick={() => add(x)}>
            ＋{x}
          </button>
        ))}
      </div>
      <div class="row add-sec">
        <input placeholder="ほかの名前(例: ガナッシュ)" value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && add(name)} />
        <button onClick={() => add(name)}>追加</button>
      </div>
    </div>
  );
}

/** 詰め合わせの編集。入れるお菓子と枚数だけ */
function BoxEditor({ p }: { p: Product }) {
  const d = useData();
  const mat = matLookup(d.mats, d.prods);
  const pieces = p.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.c !== undefined);
  const others = d.prods.filter((x) => x.id !== p.id && !x.box);
  const rest = p.lines.length - pieces.length;
  const put = (i: number, x: Partial<RecipeLine>) => setLines(p, p.lines.map((y, k) => (k === i ? { ...y, ...x } : y)));
  return (
    <>
      <div class="box-head">
        <span>入れるお菓子</span>
        <span>枚数</span>
        <span>原価</span>
      </div>
      {pieces.map(({ l, i }) => (
        <div class="box-line" key={i}>
          <ProdSelect value={l.c!} prods={others} onPick={(id) => put(i, { c: id })} />
          <NumField label="" inputMode="numeric" value={l.qty} onCommit={(v) => put(i, { qty: v })} />
          <span class="c">{yen(lineCost(l, mat))}</span>
          <button aria-label="お菓子を外す" onClick={() => setLines(p, p.lines.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => setLines(p, [...p.lines, { m: "", c: "", qty: 1 }])}>＋お菓子を追加</button>
      {rest > 0 && (
        <p class="mut">
          材料などの行が{rest}件残っています(原価に入ります)。{" "}
          <button class="linkish" onClick={() => setLines(p, p.lines.filter((l) => l.c !== undefined))}>
            消す
          </button>
        </p>
      )}
      <div class="res two">
        <div>
          <span>中のお菓子の数</span>
          <b>{n1(pieces.reduce((a, x) => a + x.l.qty, 0))}枚</b>
        </div>
        <div>
          <span>1箱あたりの材料原価</span>
          <b>{y2(productCost(p, mat).mat)}</b>
        </div>
      </div>
      <p class="mut">原価は、中のお菓子の材料原価 × 枚数の合計です。箱や包装は商品の詳細の「包装資材」で入れます。作ると、中のお菓子の在庫が減ります。</p>
    </>
  );
}

/** 詰め合わせかどうか(切りかえると、仕込み数は1箱ずつにする) */
function BoxSwitch({ p }: { p: Product }) {
  return (
    <label class="box-switch">
      <input
        type="checkbox"
        checked={!!p.box}
        onChange={(e) =>
          store.apply([{ t: "patch", col: "prods", id: p.id, patch: e.currentTarget.checked ? { box: true, yield: 1 } : { box: false } }])
        }
      />
      詰め合わせ(BAKE BOXなど。入れるお菓子と枚数だけで作る)
    </label>
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
  if (p.box)
    return (
      <>
        <BoxSwitch p={p} />
        <BoxEditor p={p} />
      </>
    );
  return (
    <>
      <BoxSwitch p={p} />
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
      <PartsBar p={p} />
      {/* 本体(枠に入っていない行)。枠に分けたあと、本体が空なら出さない */}
      {(!p.secs?.length || rows().length > 0) && (
        <div class={p.secs?.length ? "sec main" : ""}>
          {(p.secs?.length ?? 0) > 0 && <div class="sec-title">本体</div>}
          {block()}
          <AddLineButtons p={p} onAdd={setAdded} />
        </div>
      )}
      {(p.secs ?? []).map((sec) => (
        <div class={"sec" + (sec.opt ? " opt" : "")} key={sec.id}>
          <SectionHead p={p} sec={sec} />
          {block(sec.id)}
          <AddLineButtons p={p} sec={sec.id} onAdd={setAdded} />
        </div>
      ))}
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

function RecipeCard({ p, open, ed, onOpen, onEdit }: { p: Product; open: boolean; ed: boolean; onOpen: () => void; onEdit: () => void }) {
  const photos = usePhotos();
  const low = isLowProd(p);
  const head = (
    <>
      <PhotoTile photo={photos[p.id]} size={open ? 56 : 44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b class="rn">{p.name}</b>
        <small class={low ? "alert" : ""}>
          在庫 <b>{n1(p.stock)}</b>
          {!p.lines.length && " ・ ルセット未入力"}
        </small>
      </div>
    </>
  );
  if (!open)
    return (
      <button class="card rrow" onClick={onOpen} aria-expanded="false">
        {head}
        <span class="chev">›</span>
      </button>
    );
  return (
    <div class="card ropen">
      <div class="ph" style={{ marginBottom: "8px" }}>
        <button class="rhead" onClick={onOpen} aria-expanded="true" aria-label={`${p.name}を閉じる`}>
          {head}
          <span class="chev open">›</span>
        </button>
        <button onClick={onEdit}>{ed ? "編集を閉じる" : "編集"}</button>
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
  const [op, setOp] = useState<string | null>(opened);
  const [q, setQ] = useState(query);
  // 開くのは1つだけ。閉じると編集も閉じる
  const open = (id: string | null) => {
    opened = id;
    setOp(id);
    if (id !== editing) {
      editing = null;
      setEd(null);
    }
  };
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
              open(id);
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
            <RecipeCard
              key={p.id}
              p={p}
              // 検索で1つだけ見つかったときは、そのまま開く
              open={op === p.id || hits.length === 1}
              ed={ed === p.id}
              onOpen={() => open(op === p.id ? null : p.id)}
              onEdit={() => {
                open(p.id);
                toggle(ed === p.id ? null : p.id);
              }}
            />
          ))}
        </section>
      ))}
    </>
  );
}
