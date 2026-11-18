// BASE・Square の売上の取り込み(SPEC.md 12章)の画面
import { useState } from "preact/hooks";
import { saveShopKey, syncShopsNow } from "../data/cloud";
import { store, useData, useStore } from "../data/store";
import { n1, yen } from "../lib/format";
import { bestMatch, linkPatches, suggestOrder, unlinked } from "../lib/shops";
import type { Product } from "../lib/types";
import { toast } from "../ui/parts";

const NAME = { base: "BASE", square: "Square" } as const;

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

let busy = false;
/** 今すぐ取り込む */
async function runNow(quiet = false) {
  if (busy) return;
  busy = true;
  if (!quiet) toast("取り込んでいます…");
  try {
    const r = await syncShopsNow();
    const parts = [r.base !== undefined && `BASE ${r.base}件`, r.square !== undefined && `Square ${r.square}件`].filter(Boolean);
    toast(parts.length ? `取り込みました(${parts.join("、")})` : "鍵がまだありません");
  } catch {
    toast("取り込めませんでした。少し待ってからもう一度押してください");
  } finally {
    busy = false;
  }
}

function KeyRow({ src }: { src: "base" | "square" }) {
  const st = useStore();
  const s = st.shopSync?.[src];
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const status = !s ? (
    <span class="mut">まだつながっていません</span>
  ) : s.error ? (
    <span style={{ color: "var(--neg)" }}>{s.error}</span>
  ) : (
    <span class="mut">つながっています(最後の取り込み {when(s.last)})</span>
  );
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
      <div class="row">
        <b>{NAME[src]}</b>
        <button class="right" onClick={() => setOpen(!open)}>
          {s ? "鍵を貼り直す" : "鍵を貼り付ける"}
        </button>
      </div>
      <div>
        <small>{status}</small>
      </div>
      {open && (
        <div class="row" style={{ marginTop: "8px", gap: "8px" }}>
          <input
            type="password"
            autocomplete="off"
            placeholder={`${NAME[src]}の鍵(トークン)`}
            value={key}
            onInput={(e) => setKey(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <button
            class="pri"
            onClick={async () => {
              if (key.trim().length < 10) return toast("鍵を貼り付けてください");
              try {
                await saveShopKey(src, key);
                setKey("");
                setOpen(false);
                toast("鍵を保存しました。取り込んでいます…");
                runNow(true);
              } catch {
                toast("保存できませんでした。電波を確かめてください");
              }
            }}
          >
            保存
          </button>
        </div>
      )}
    </div>
  );
}

/** 名前が1つだけ合う商品を、まとめて結びつける */
function autoLinks(prods: Product[], ext: ReturnType<typeof useData>["extitems"]): { id: string; patch: Partial<Product> }[] {
  const xs = ext ?? [];
  const out: { id: string; patch: Partial<Product> }[] = [];
  for (const src of ["base", "square"] as const) {
    const field = src === "base" ? "baseItem" : "sqItem";
    let free = unlinked(xs, prods, src);
    for (const p of prods) {
      if (p[field]) continue;
      const m = bestMatch(free, p.name);
      if (!m) continue;
      free = free.filter((x) => x !== m);
      const cur = out.find((o) => o.id === p.id);
      if (cur) cur.patch[field] = m.ext;
      else out.push({ id: p.id, patch: { [field]: m.ext } });
    }
  }
  return out;
}

/** 結びつけの一覧: BASE・Squareの商品ごとに、どのアプリの商品と結びついているか */
function LinkList({ sells, open }: { sells: Product[]; open: boolean }) {
  const d = useData();
  const ext = d.extitems ?? [];
  const [onlyFree, setOnlyFree] = useState(false);
  const part = (src: "base" | "square") => {
    const field = src === "base" ? "baseItem" : "sqItem";
    const linkedTo = new Map(d.prods.filter((p) => p[field]).map((p) => [p[field]!, p]));
    const xs = ext
      .filter((x) => x.src === src)
      .sort((a, b) => Number(linkedTo.has(a.ext)) - Number(linkedTo.has(b.ext)) || a.name.localeCompare(b.name, "ja"))
      .filter((x) => !onlyFree || !linkedTo.has(x.ext));
    const free = ext.filter((x) => x.src === src && !linkedTo.has(x.ext)).length;
    if (!ext.some((x) => x.src === src)) return null;
    return (
      <>
        <h3 style={{ margin: "12px 0 4px" }}>
          {NAME[src]}の商品 <small class="mut">(結びついていない {free}件)</small>
        </h3>
        {xs.map((x) => {
          const p = linkedTo.get(x.ext);
          return (
            <div key={x.ext} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
              <div>
                {p ? "✓ " : <b style={{ color: "var(--neg)" }}>未 </b>}
                {x.name}
                {x.price ? <small class="mut"> {yen(x.price)}</small> : null}
              </div>
              <select
                value={p?.id ?? ""}
                style={{ width: "100%", marginTop: "4px" }}
                onChange={(e) => {
                  const ps = linkPatches(d.prods, x, e.currentTarget.value);
                  store.apply(ps.map((a) => ({ t: "patch" as const, col: "prods" as const, id: a.id, patch: a.patch })));
                }}
              >
                <option value="">(結びつけない)</option>
                {sells
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                        {q[field] && q[field] !== x.ext ? "(ほかの商品と結びつけ済み)" : ""}
                      </option>
                    ))}
              </select>
            </div>
          );
        })}
      </>
    );
  };
  return (
    <details open={open}>
      <summary>結びつけの一覧</summary>
      <p class="mut" style={{ margin: "6px 0" }}>
        上の名前がBASE・Squareの商品、その下の欄が結びついているBAKE HUBの商品です。「未」はまだ結びついていません。送料やもう売っていない商品は「(結びつけない)」のままで大丈夫です。
      </p>
      <label class="sell" style={{ display: "flex", margin: "6px 0" }}>
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.currentTarget.checked)} />
        結びついていない商品だけ見る
      </label>
      {part("base")}
      {part("square")}
    </details>
  );
}

/** 売上タブ: BASE・Square の取り込み */
export function ShopsCard() {
  const st = useStore();
  const d = useData();
  if (st.mode !== "cloud") return null;
  const os = (d.osales ?? []).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const ext = d.extitems ?? [];
  const sells = d.prods.filter((p) => p.genre !== "生地・パーツ");
  const nb = unlinked(ext, sells, "base").length;
  const ns = unlinked(ext, sells, "square").length;
  const auto = autoLinks(sells, ext);
  const prodName = (id: string) => d.prods.find((p) => p.id === id)?.name ?? "(消した商品)";
  return (
    <div class="card">
      <h2>BASE・Square の売上の取り込み</h2>
      <p class="mut" style={{ marginTop: 0 }}>
        15分ごとに、BASEの注文とSquareのレジの売上を読み込みます。BASEで売れた分は、結びつけた商品の在庫から減ります。Squareの売上は、イベントの記録画面の「Squareの売上から入れる」で使います。BASE・Squareの在庫は変えません。
      </p>
      <KeyRow src="base" />
      <KeyRow src="square" />
      {st.shopSync && (
        <p>
          <button onClick={() => runNow()}>今すぐ取り込む</button>
        </p>
      )}
      {(nb > 0 || ns > 0) && (
        <p class="mut">
          アプリの商品と結びついていない商品: {nb > 0 && `BASE ${nb}件`}
          {nb > 0 && ns > 0 && "、"}
          {ns > 0 && `Square ${ns}件`}。下の「結びつけの一覧」で選べます。
        </p>
      )}
      {ext.length > 0 && <LinkList sells={sells} open={nb + ns > 0} />}
      {auto.length > 0 && (
        <details>
          <summary>名前が合う商品を結びつける({auto.length}件)</summary>
          {auto.map((a) => (
            <div key={a.id}>
              <small>
                {prodName(a.id)} ←{" "}
                {[a.patch.baseItem, a.patch.sqItem]
                  .filter(Boolean)
                  .map((e) => {
                    const x = ext.find((y) => y.ext === e)!;
                    return `${NAME[x.src]}「${x.name}」`;
                  })
                  .join("、")}
              </small>
            </div>
          ))}
          <p>
            <button
              class="pri"
              onClick={() => {
                store.apply(auto.map((a) => ({ t: "patch" as const, col: "prods" as const, id: a.id, patch: a.patch })));
                toast(`${auto.length}件を結びつけました`);
              }}
            >
              この組み合わせで結びつける
            </button>
          </p>
        </details>
      )}
      {os.length > 0 && (
        <details>
          <summary>取り込んだ売上(新しい順)</summary>
          {os.slice(0, 30).map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
              <div class="row">
                <span>
                  {s.date.slice(5).replace("-", "/")} {NAME[s.src]}
                  {s.cancelled && <small style={{ color: "var(--neg)" }}> キャンセル</small>}
                </span>
                <span class="right">{yen(s.total)}</span>
              </div>
              <small class="mut">
                {s.lines.map((l) => `${l.name}×${n1(l.qty)}`).join("、")}
                {s.stock && Object.keys(s.stock).length > 0 && (
                  <>
                    <br />
                    在庫を減らした: {Object.entries(s.stock).map(([id, n]) => `${prodName(id)} ${n1(n)}`).join("、")}
                  </>
                )}
              </small>
            </div>
          ))}
        </details>
      )}
      <details>
        <summary>鍵(トークン)の作り方</summary>
        <p>
          <b>BASE</b>: <a href="https://developers.thebase.com/apiv2" target="_blank" rel="noopener">BASE Developers(API v2)</a>{" "}
          にBASEのアカウントでログイン → Personal Access Token(パーソナルアクセストークン)を発行。権限は「商品の読み取り(items.read)」と「注文の読み取り(orders.read)」。有効期限はいちばん長いものを選び、期限が来たら作り直して貼り直します。
        </p>
        <p>
          <b>Square</b>: <a href="https://developer.squareup.com/apps" target="_blank" rel="noopener">Square Developer</a>{" "}
          にSquareのアカウントでログイン →「アプリケーションを作成」→ 上の切りかえを「本番環境」にして「本番アクセストークン」をコピー。
        </p>
        <p class="mut">鍵はこのアプリからは読めない場所に保存します。人に見せないでください。</p>
      </details>
    </div>
  );
}

/** 商品の詳細: BASE・Square の商品との結びつけ */
export function ShopLinkRows({ p }: { p: Product }) {
  const d = useData();
  const ext = d.extitems ?? [];
  if (!ext.length) return null;
  const row = (src: "base" | "square") => {
    const field = src === "base" ? "baseItem" : "sqItem";
    const xs = ext.filter((x) => x.src === src);
    if (!xs.length) return null;
    const usedBy = new Map(d.prods.filter((q) => q.id !== p.id && q[field]).map((q) => [q[field]!, q.name]));
    return (
      <label>
        {NAME[src]}の商品
        <select
          value={p[field] ?? ""}
          onChange={(e) => store.apply([{ t: "patch", col: "prods", id: p.id, patch: { [field]: e.currentTarget.value || null } }])}
        >
          <option value="">(結びつけない)</option>
          {suggestOrder(xs, p.name).map((x) => (
            <option key={x.ext} value={x.ext}>
              {x.name}
              {x.price ? ` ${yen(x.price)}` : ""}
              {usedBy.has(x.ext) ? `(${usedBy.get(x.ext)}と結びつけ済み)` : ""}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <>
      <h2 style={{ marginTop: "14px" }}>BASE・Squareの商品</h2>
      <div class="grid">
        {row("base")}
        {row("square")}
      </div>
      <p class="mut">
        結びつけると、BASEで売れた分がこの商品の在庫から減ります(
        {p.gram ? "1つ売れると1袋分" : (p.pc ?? 1) > 1 ? `1つ売れると${p.pc}枚` : "1つ売れると1個"})。
      </p>
    </>
  );
}
