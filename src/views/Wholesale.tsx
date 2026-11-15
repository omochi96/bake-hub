// 卸し(売上タブの中): 卸先の一覧と、納品(売上)の記録。SPEC.md 3章・4章
import { useState } from "preact/hooks";
import { store, useData } from "../data/store";
import { lotSize, matLookup, productCost, wholeTotals } from "../lib/calc";
import { n1, num, today, uid, yen } from "../lib/format";
import { sortProds } from "../lib/order";
import { SALE_GENRES, type Client, type Product, type WholeItem, type WholeSale } from "../lib/types";
import { DelButton, NumField, TextField, toast } from "../ui/parts";

/** 商品を選ぶ(ジャンルごと、並び順で) */
function ProdPick({ value, prods, onPick, label = "商品" }: { value: string; prods: Product[]; onPick: (id: string) => void; label?: string }) {
  const groups = SALE_GENRES.map((g) => ({ g, ps: sortProds(prods.filter((x) => x.genre === g)) })).filter((x) => x.ps.length);
  return (
    <select value={value} aria-label={label} onChange={(e) => onPick(e.currentTarget.value)}>
      <option value="">商品を選ぶ</option>
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

function patchClient(c: Client, x: Partial<Client>) {
  store.apply([{ t: "patch", col: "clients", id: c.id, patch: x }]);
}

/** 卸先1件(開くと、名前・メモ・商品ごとの1ロットの枚数を編集) */
function ClientRow({ c, year }: { c: Client; year: number }) {
  const d = useData();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const ys = (d.wsales ?? []).filter((w) => w.client === c.id && +w.date.slice(0, 4) === year);
  const total = ys.reduce((a, w) => a + wholeTotals(w).sales, 0);
  const lots = Object.entries(c.lots ?? {});
  const prodName = (id: string) => d.prods.find((p) => p.id === id)?.name ?? "(削除された商品)";
  return (
    <div class={"client" + (open ? " open" : "")}>
      <button class="client-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <b>{c.name}</b>
          <small>
            {year}年 {ys.length}回・{yen(total)}
            {lots.length > 0 && ` ・ ロット指定${lots.length}件`}
          </small>
        </span>
        <span class={"chev" + (open ? " open" : "")}>›</span>
      </button>
      {open && (
        <div class="client-body">
          <div class="grid" style={{ marginTop: 0 }}>
            <TextField label="卸先の名前" cls="full" value={c.name} onCommit={(v) => v.trim() && patchClient(c, { name: v.trim() })} />
            <TextField label="メモ(連絡先・納品の決まりなど)" cls="full" value={c.memo ?? ""} onCommit={(v) => patchClient(c, { memo: v })} />
          </div>
          <div class="rl-h">この卸先の1ロットの枚数</div>
          {lots.map(([pid, n]) => (
            <div class="lot-row" key={pid}>
              <span>{prodName(pid)}</span>
              <NumField
                label=""
                inputMode="numeric"
                value={n}
                onCommit={(v) => patchClient(c, { lots: { ...c.lots, [pid]: v } })}
              />
              <small>枚</small>
              <button
                aria-label="ロットの指定を外す"
                onClick={() => {
                  const { [pid]: _x, ...rest } = c.lots ?? {};
                  patchClient(c, { lots: rest });
                }}
              >
                ×
              </button>
            </div>
          ))}
          <div class="row" style={{ marginTop: "6px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProdPick value={pick} prods={d.prods.filter((p) => !(p.id in (c.lots ?? {})))} onPick={setPick} />
            </div>
            <button
              onClick={() => {
                const p = d.prods.find((x) => x.id === pick);
                if (!p) return toast("商品を選んでください");
                patchClient(c, { lots: { ...c.lots, [p.id]: p.wlot || 1 } });
                setPick("");
              }}
            >
              ロットを指定
            </button>
          </div>
          <p class="mut">指定のない商品は、商品の詳細の「1ロットの枚数」を使います。</p>
          <DelButton
            label="この卸先を削除"
            armedLabel="もう一度で削除(納品の記録は残ります)"
            onConfirm={() => store.apply([{ t: "del", col: "clients", id: c.id }])}
          />
        </div>
      )}
    </div>
  );
}

/** 納品の記録の入力。商品とロット数の行をいくつでも */
type Row = { prod: string; lots: string };

function DeliveryForm() {
  const d = useData();
  const mat = matLookup(d.mats, d.prods);
  const clients = d.clients ?? [];
  const [date, setDate] = useState(today());
  const [cid, setCid] = useState(clients[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([{ prod: "", lots: "" }]);
  const [memo, setMemo] = useState("");
  const client = clients.find((c) => c.id === cid);
  const put = (i: number, x: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...x } : r)));
  const items: WholeItem[] = rows.flatMap((r) => {
    const p = d.prods.find((x) => x.id === r.prod);
    const lots = num(r.lots);
    if (!p || !lots) return [];
    const lot = lotSize(p, client);
    return [{ prod: p.id, name: p.name, lots, lot, qty: lots * lot, price: p.whole, cost: productCost(p, mat, lot).wtot }];
  });
  const sum = items.reduce((a, it) => a + it.qty * it.price, 0);
  if (!clients.length) return <p class="mut">納品を記録するには、先に卸先を登録してください。</p>;
  return (
    <div class="plan-add" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
      <div class="grid" style={{ marginTop: 0 }}>
        <label>
          納品日
          <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <label>
          卸先
          <select value={cid} onChange={(e) => setCid(e.currentTarget.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.map((r, i) => {
        const p = d.prods.find((x) => x.id === r.prod);
        const lot = p ? lotSize(p, client) : 0;
        return (
          <div class="plan-row" key={i}>
            <div class="pr-main">
              <ProdPick value={r.prod} prods={d.prods} onPick={(id) => put(i, { prod: id })} />
              {p && (
                <small class="mut">
                  1ロット{n1(lot)}枚・卸価格{yen(p.whole)}
                  {num(r.lots) > 0 && ` → ${n1(num(r.lots) * lot)}枚 ${yen(num(r.lots) * lot * p.whole)}`}
                  {!p.whole && "(卸価格が未設定です)"}
                </small>
              )}
            </div>
            <input
              class="pr-qty"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="ロット"
              aria-label="ロット数"
              value={r.lots}
              onInput={(e) => put(i, { lots: e.currentTarget.value })}
            />
            {rows.length > 1 && (
              <button class="pr-del" aria-label="この行を消す" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                ×
              </button>
            )}
          </div>
        );
      })}
      <button onClick={() => setRows((rs) => [...rs, { prod: "", lots: "" }])}>＋商品を追加</button>
      <label class="mut" style={{ display: "block", marginTop: "10px" }}>
        メモ
        <input placeholder="任意" value={memo} onInput={(e) => setMemo(e.currentTarget.value)} />
      </label>
      <button
        class="pri"
        style={{ marginTop: "10px" }}
        onClick={() => {
          if (!client) return toast("卸先を選んでください");
          if (!items.length) return toast("商品とロット数を入れてください");
          const w: WholeSale = { id: uid(), date, client: client.id, cname: client.name, items, ...(memo.trim() ? { memo: memo.trim() } : {}) };
          store.apply([{ t: "add", col: "wsales", item: w, first: true }]);
          setRows([{ prod: "", lots: "" }]);
          setMemo("");
          toast(`${client.name}への納品(${yen(sum)})を記録しました`);
        }}
      >
        納品を記録{sum ? `(${yen(sum)})` : ""}
      </button>
    </div>
  );
}

/** 売上タブの「卸し」 */
export function WholesaleCard({ year }: { year: number }) {
  const d = useData();
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"list" | "add">("list");
  const clients = d.clients ?? [];
  const ys = (d.wsales ?? []).filter((w) => +w.date.slice(0, 4) === year).sort((a, b) => (a.date < b.date ? 1 : -1));
  const tot = ys.reduce((a, w) => {
    const t = wholeTotals(w);
    return { sales: a.sales + t.sales, cost: a.cost + t.cost };
  }, { sales: 0, cost: 0 });
  return (
    <div class="card">
      <h2>卸し</h2>
      <div class="res two" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
        <div>
          <span>{year}年の卸し売上</span>
          <b>{yen(tot.sales)}</b>
        </div>
        <div>
          <span>粗利(売上 − 原価)</span>
          <b>{yen(tot.sales - tot.cost)}</b>
        </div>
      </div>
      <div class="rl-h">卸先</div>
      {clients.map((c) => (
        <ClientRow key={c.id} c={c} year={year} />
      ))}
      <div class="row add-sec">
        <input placeholder="新しい卸先の名前" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button
          onClick={() => {
            const v = name.trim();
            if (!v) return toast("卸先の名前を入れてください");
            store.apply([{ t: "add", col: "clients", item: { id: uid(), name: v } }]);
            setName("");
          }}
        >
          卸先を追加
        </button>
      </div>
      <div class="seg" role="tablist" style={{ marginTop: "8px" }}>
        <button class={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
          納品の記録
        </button>
        <button class={tab === "add" ? "on" : ""} onClick={() => setTab("add")}>
          納品を入れる
        </button>
      </div>
      {tab === "add" ? (
        <DeliveryForm />
      ) : ys.length ? (
        ys.map((w) => (
          <div class="bk-row" key={w.id}>
            <i class="tag whole">{w.date.slice(5).replace("-", "/")}</i>
            <span>
              <b>
                {w.cname} {yen(wholeTotals(w).sales)}
              </b>
              <small>
                {w.items.map((it) => `${it.name} ${n1(it.lots)}ロット(${n1(it.qty)}枚)`).join("、")}
                {w.memo && ` ・ ${w.memo}`}
              </small>
            </span>
            <DelButton label="削除" armedLabel="もう一度" onConfirm={() => store.apply([{ t: "del", col: "wsales", id: w.id }])} />
          </div>
        ))
      ) : (
        <p class="mut">{year}年の納品の記録はまだありません。</p>
      )}
      <p class="mut">
        売上は卸価格、原価は卸し用の原価(材料 + 卸し用の包装資材)で、記録したときの値で計算します。月別の表と利益率にも入ります。製造の「卸し」で卸先を選ぶと、納品も一緒に記録できます。
      </p>
    </div>
  );
}
