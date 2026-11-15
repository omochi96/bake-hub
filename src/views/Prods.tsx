// 商品(一覧と詳細)
import cookiesImg from "../assets/cookies.png";
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { photoUrl } from "../data/photos";
import { store, useData, usePhotos } from "../data/store";
import { matLookup, productCost, recommendedPrice, recommendedWhole, targetCostRate, baseItem } from "../lib/calc";
import { n1, uid, y2, yen } from "../lib/format";
import { squarePhoto } from "../lib/image";
import { isLowProd } from "../lib/stock";
import { GENRES, GOODS, type Product } from "../lib/types";
import { DelButton, NumField, PhotoTile, SelectField, TextField, toast } from "../ui/parts";
import { go, useRoute } from "../ui/router";

export function newProduct(name: string, genre: string): Product {
  return { id: uid(), genre, name, yield: 10, extra: 0, stock: 0, min: 0, price: 0, whole: 0, lines: [] };
}

function patch(id: string, p: Partial<Product>) {
  store.apply([{ t: "patch", col: "prods", id, patch: p }]);
}

/** 商品を追加する行(ジャンル + 名前 + ボタン) */
export function AddProductRow(p: {
  placeholder: string;
  button: string;
  onAdded: (id: string) => void;
  emptyMsg: string;
  genres: readonly string[];
}) {
  const [genre, setGenre] = useState<string>(p.genres[0]);
  const [name, setName] = useState("");
  const add = () => {
    const v = name.trim();
    if (!v) return toast(p.emptyMsg);
    const np = newProduct(v, genre);
    store.apply([{ t: "add", col: "prods", item: np }]);
    setName("");
    p.onAdded(np.id);
  };
  return (
    <div class="row">
      {p.genres.length > 1 && (
        <select style={{ width: "auto" }} value={genre} onChange={(e) => setGenre(e.currentTarget.value)}>
          {p.genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      )}
      <input
        placeholder={p.placeholder}
        style={{ flex: 1, width: "auto" }}
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <button class="pri" onClick={add}>
        {p.button}
      </button>
    </div>
  );
}

function ProdList() {
  const d = useData();
  const photos = usePhotos();
  const mat = matLookup(d.mats);
  const low = d.prods.filter(isLowProd);
  return (
    <>
      <div class="ph" style={{ marginBottom: "12px" }}>
        <h1>商品</h1>
        <div class="pic illo wide">
          <img src={cookiesImg} alt="" />
        </div>
      </div>
      {low.length > 0 && <div class="note">【在庫】{low.map((p) => p.name).join("・")}の在庫が少なくなっています。そろそろ作りましょう</div>}
      {GENRES.map((g) => {
        const gp = d.prods.filter((p) => p.genre === g);
        if (!gp.length && g !== GOODS) return null;
        return (
          <Fragment key={g}>
            <h2 style={{ margin: "16px 0 8px" }}>{g}</h2>
            {g === GOODS && (
              // 雑貨はルセットがないので、ここで追加する
              <div style={{ marginBottom: "10px" }}>
                <AddProductRow
                  placeholder="雑貨の名前"
                  button="追加"
                  emptyMsg="雑貨の名前を入力してください"
                  genres={[GOODS]}
                  onAdded={(id) => go.prod(id)}
                />
              </div>
            )}
            {gp.map((p) => {
              const c = productCost(p, mat);
              const lw = isLowProd(p);
              return (
                <button key={p.id} class="card evb" onClick={() => go.prod(p.id)}>
                  <div class="ph">
                    <PhotoTile photo={photos[p.id]} size={56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{p.name}</b>
                      <br />
                      <small>販売 {p.price ? `${yen(p.price)}(原価率${n1((c.tot / p.price) * 100)}%)` : "未設定"}</small>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span class={lw ? "alert" : ""}>
                        <b>在庫 {n1(p.stock)}</b>
                      </span>
                      {lw && (
                        <>
                          <br />
                          <span class="badge w" style={{ margin: 0 }}>
                            要作成
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </Fragment>
        );
      })}
      {!d.prods.length && <p class="mut">商品は「ルセット」タブで作ると、ここに並びます(雑貨は上の「雑貨」から追加)。</p>}
    </>
  );
}

function PhotoEditor({ p, photo }: { p: Product; photo?: string }) {
  const u = photoUrl(photo);
  const [busy, setBusy] = useState(false);
  return (
    <div class="photo-head">
      <div class="pic cover">{u ? <img src={u} alt="" /> : <span class="mut">写真は準備中</span>}</div>
      <div class="photo-actions">
        <label class="btnlike">
          {busy ? "読み込み中…" : u ? "写真を変える" : "写真を追加"}
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!f) return;
              setBusy(true);
              try {
                const v = await squarePhoto(f);
                store.apply([{ t: "photo", id: p.id, value: v }]);
                toast("写真を保存しました");
              } catch {
                toast("写真を読み込めませんでした");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {u && (
          <DelButton label="写真を外す" armedLabel="もう一度押すと外す" onConfirm={() => store.apply([{ t: "photo", id: p.id, value: null }])} />
        )}
      </div>
    </div>
  );
}

/** BASEでの販売価格と、手数料・手取り・原価率・粗利(SPEC.md 4章) */
function BaseCard({ p, tot }: { p: Product; tot: number }) {
  const d = useData();
  const t = targetCostRate(d.cfg);
  const bi = baseItem(p.basePrice ?? 0, tot, d.cfg);
  return (
    <>
      <div class="card">
        <h2>BASEでの販売</h2>
        <div class="grid">
          <NumField
            label="BASE販売価格(円)"
            value={p.basePrice ?? 0}
            blankZero
            placeholder="例: 400"
            onCommit={(v) => patch(p.id, { basePrice: v })}
          />
        </div>
        {p.basePrice ? (
          <div class="res two">
            <div>
              <span>BASE手数料/個</span>
              <b>{y2(bi.fee)}</b>
            </div>
            <div>
              <span>手取り/個</span>
              <b>{y2(bi.net)}</b>
            </div>
            <div class={bi.rate !== null && bi.rate > t ? "neg" : ""}>
              <span>原価率</span>
              <b>{bi.rate === null ? "-" : n1(bi.rate) + "%"}</b>
            </div>
            <div class={bi.profit < 0 ? "neg" : ""}>
              <span>粗利/個(手数料を引いたあと)</span>
              <b>{y2(bi.profit)}</b>
            </div>
          </div>
        ) : null}
        <p class="mut">
          BASEで売らない商品は空欄のまま。手数料は {n1(d.cfg.baseRate)}% + 1注文{yen(d.cfg.baseFix)} で計算(1注文で1個売れたとき)。率は「売上」タブの設定で変えられます。
        </p>
      </div>
    </>
  );
}

function ProdDetail({ id }: { id: string }) {
  const d = useData();
  const photos = usePhotos();
  const p = d.prods.find((x) => x.id === id);
  if (!p) return <ProdList />;
  const c = productCost(p, matLookup(d.mats));
  const t = targetCostRate(d.cfg);
  const rec = recommendedPrice(c.tot, t);
  const rw = recommendedWhole(rec, d.cfg.whole);
  const low = isLowProd(p);
  const rt = (x: number) => (x ? n1((c.tot / x) * 100) + "%" : "-");
  const goods = p.genre === GOODS;
  return (
    <>
      <button style={{ marginBottom: "10px" }} onClick={() => go.prod(null)}>
        ← 商品一覧
      </button>
      <PhotoEditor p={p} photo={photos[p.id]} />
      <div class="grid">
        <TextField label="商品名" cls="full" value={p.name} onCommit={(v) => patch(p.id, { name: v })} />
        <SelectField label="ジャンル" cls="full" value={p.genre} options={GENRES} onCommit={(v) => patch(p.id, { genre: v })} />
        <NumField
          label="現在の在庫"
          value={p.stock}
          onCommit={(v) => store.apply([{ t: "incr", col: "prods", id: p.id, field: "stock", delta: v - p.stock }])}
        />
        <NumField
          label={goods ? "発注の目安(この数以下で通知)" : "作成の目安(この数以下で通知)"}
          value={p.min}
          onCommit={(v) => patch(p.id, { min: v })}
        />
      </div>
      {low && <div class="note">在庫が少なくなっています。{goods ? "そろそろ仕入れましょう" : "そろそろ作りましょう"}</div>}
      {goods ? (
        <>
          <div class="card">
            <h2>原価と価格(1個あたり)</h2>
            <div class="grid">
              <NumField label="原価・仕入れ値(円)" value={p.buy ?? 0} onCommit={(v) => patch(p.id, { buy: v })} />
              <NumField label="販売価格(円)" value={p.price} onCommit={(v) => patch(p.id, { price: v })} />
            </div>
            <div class="res two">
              <div class={p.price && (c.tot / p.price) * 100 > t ? "neg" : ""}>
                <span>原価率</span>
                <b>{rt(p.price)}</b>
              </div>
              <div class={p.price && p.price < c.tot ? "neg" : ""}>
                <span>粗利/個</span>
                <b>{p.price ? y2(p.price - c.tot) : "-"}</b>
              </div>
            </div>
          </div>
          <BaseCard p={p} tot={c.tot} />
        </>
      ) : (
        <>
      <div class="card">
        <h2>原価(1個あたり)</h2>
        <div class="res">
          <div>
            <span>材料原価</span>
            <b>{y2(c.mat)}</b>
          </div>
          <div>
            <span>包装代</span>
            <b>{y2(c.pk)}</b>
          </div>
          <div>
            <span>包装代込み原価</span>
            <b>{y2(c.tot)}</b>
          </div>
        </div>
        <h2 style={{ marginTop: "12px" }}>包装代の内訳(円/個)</h2>
        <div class="grid" style={{ marginTop: 0 }}>
          <NumField label="ガス袋" value={p.pack?.gas ?? 0} onCommit={(v) => patch(p.id, { pack: { ...p.pack, gas: v } })} />
          <NumField label="脱酸素剤" value={p.pack?.oxy ?? 0} onCommit={(v) => patch(p.id, { pack: { ...p.pack, oxy: v } })} />
          <NumField label="シートドライヤー" value={p.pack?.dry ?? 0} onCommit={(v) => patch(p.id, { pack: { ...p.pack, dry: v } })} />
          <NumField label="その他" value={p.extra} onCommit={(v) => patch(p.id, { extra: v })} />
        </div>
        <p class="mut">材料原価は、ルセットから自動で計算しています。</p>
      </div>
      <div class="card">
        <h2>価格</h2>
        <div class="grid">
          <NumField label="販売価格(円)" value={p.price} onCommit={(v) => patch(p.id, { price: v })} />
          <NumField label="卸価格(円)" value={p.whole} onCommit={(v) => patch(p.id, { whole: v })} />
        </div>
        <div class="res">
          <div class={p.price && (c.tot / p.price) * 100 > t ? "neg" : ""}>
            <span>販売の原価率</span>
            <b>{rt(p.price)}</b>
          </div>
          <div>
            <span>販売の粗利/個</span>
            <b>{p.price ? y2(p.price - c.tot) : "-"}</b>
          </div>
          <div class={p.whole && p.whole < c.tot ? "neg" : ""}>
            <span>卸の原価率</span>
            <b>{rt(p.whole)}</b>
          </div>
        </div>
        <p class="mut">
          材料だけの原価率: 販売 {p.price ? n1((c.mat / p.price) * 100) + "%" : "-"} / 卸{" "}
          {p.whole ? n1((c.mat / p.whole) * 100) + "%" : "-"}
        </p>
      </div>
      <BaseCard p={p} tot={c.tot} />
      <div class="card">
        <h2>推奨価格(目標原価率{t}%)</h2>
        <div class="res two">
          <div>
            <span>推奨販売価格</span>
            <b>{yen(rec)}</b>
            <span>原価率 {rt(rec)}</span>
          </div>
          <div>
            <span>推奨卸価格(販売の{d.cfg.whole}%)</span>
            <b>{yen(rw)}</b>
            <span>原価率 {rt(rw)}</span>
          </div>
        </div>
      </div>
        </>
      )}
      <DelButton
        label="この商品を削除"
        onConfirm={() => {
          store.apply([
            { t: "del", col: "prods", id: p.id },
            { t: "photo", id: p.id, value: null },
          ]);
          go.prod(null);
        }}
      />
    </>
  );
}

export function Prods() {
  const r = useRoute();
  return r.prSel ? <ProdDetail id={r.prSel} /> : <ProdList />;
}
