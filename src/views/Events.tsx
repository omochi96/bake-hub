// イベント出店(予定の一覧と、記録画面)
import { useRef, useState } from "preact/hooks";
import { store, useData, type Op } from "../data/store";
import { eventReferenceSales, eventResult, matLookup, soldOf } from "../lib/calc";
import { n1, today, uid, yen } from "../lib/format";
import { applyEventStock, buildEventItems, type DraftItems } from "../lib/stock";
import type { EventRecord, Schedule } from "../lib/types";
import { DelButton, NumField, toast } from "../ui/parts";
import { go, useRoute } from "../ui/router";

export function schedTime(x: Schedule, withPlace = true): string {
  return x.date + " " + (x.start || "") + (x.end ? "〜" + x.end : "") + (withPlace && x.place ? "・" + x.place : "");
}

export function upcoming(sched: Schedule[], td: string): Schedule[] {
  return sched.filter((x) => x.date >= td).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 予定の登録フォームの入力(タブを移っても残す) */
const DS = { date: today(), name: "", place: "", start: "10:00", end: "16:00" };

function AddSchedule({ open }: { open: boolean }) {
  const [f, setF] = useState({ ...DS });
  const set = (k: keyof typeof DS, v: string) => {
    DS[k] = v;
    setF({ ...DS });
  };
  const inp = (k: keyof typeof DS, label: string, type: "text" | "date" | "time" = "text", cls?: string) => (
    <label class={cls}>
      {label}
      <input type={type as "text"} value={f[k]} onInput={(e) => set(k, e.currentTarget.value)} />
    </label>
  );
  return (
    <details class="card" open={open}>
      <summary>出店予定を登録</summary>
      <div class="grid">
        {inp("date", "日付", "date")}
        {inp("name", "イベント名")}
        {inp("place", "出店場所", "text", "full")}
        {inp("start", "開始", "time")}
        {inp("end", "終了", "time")}
      </div>
      <button
        class="pri"
        onClick={() => {
          if (!DS.name.trim() || !DS.date) return toast("日付とイベント名を入力してください");
          store.apply([
            {
              t: "add",
              col: "sched",
              item: { id: uid(), date: DS.date, name: DS.name.trim(), place: DS.place.trim(), start: DS.start, end: DS.end },
            },
          ]);
          DS.name = "";
          DS.place = "";
          setF({ ...DS });
          toast("出店予定を登録しました");
        }}
      >
        予定を登録
      </button>
    </details>
  );
}

function EvCard({ x, td, rec }: { x: Schedule; td: string; rec?: EventRecord }) {
  const d = useData();
  const c = rec ? eventResult(rec, d.cfg) : null;
  const b = rec ? "記録済み" : x.date < td ? "未記録" : "予定";
  return (
    <button class="card evb" onClick={() => go.event(x.id)}>
      <div class="row">
        <b>{x.name}</b>
        <span class={"badge" + (rec ? " ok2" : x.date < td ? " w" : "")}>{b}</span>
      </div>
      <small>{schedTime(x)}</small>
      {c && (
        <div style={{ marginTop: "6px" }}>
          売上 <b>{yen(c.sales)}</b>・差引利益 <b>{yen(c.net)}</b>
        </div>
      )}
    </button>
  );
}

function EvList() {
  const d = useData();
  const td = today();
  const recBy = new Map(d.events.map((e) => [e.sid, e]));
  const up = upcoming(d.sched, td);
  const pa = d.sched.filter((x) => x.date < td).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <>
      <h1>イベント出店</h1>
      <AddSchedule open={!d.sched.length} />
      {up.length > 0 && (
        <>
          <h2>これからのイベント</h2>
          {up.map((x) => (
            <EvCard key={x.id} x={x} td={td} rec={recBy.get(x.id)} />
          ))}
        </>
      )}
      {pa.length > 0 && (
        <>
          <h2 style={{ marginTop: "16px" }}>過去のイベント</h2>
          {pa.map((x) => (
            <EvCard key={x.id} x={x} td={td} rec={recBy.get(x.id)} />
          ))}
        </>
      )}
      {!d.sched.length && <p class="mut">予定を登録すると、ここに並びます。タップすると、売上や売れた数を記録できます。</p>}
    </>
  );
}

interface Draft {
  visitors: number;
  fee: number;
  trans: number;
  cash: number;
  card: number;
  emoney: number;
  qr: number;
  memo: string;
  items: DraftItems;
}

function loadDraft(r?: EventRecord): Draft {
  const D: Draft = { visitors: 0, fee: 0, trans: 0, cash: 0, card: 0, emoney: 0, qr: 0, memo: "", items: {} };
  if (!r) return D;
  for (const k of ["visitors", "fee", "cash", "card", "emoney", "qr"] as const) D[k] = r[k] || 0;
  D.trans = r.trans || 0;
  D.memo = r.memo || "";
  for (const i of r.items) D.items[i.id] = { sold: soldOf(i), loss: i.loss };
  return D;
}

function Result({ r }: { r: EventRecord }) {
  const cfg = useData().cfg;
  const c = eventResult(r, cfg);
  return (
    <div class="card">
      <h2>この回の結果</h2>
      <div class="res">
        <div>
          <span>売上</span>
          <b>{yen(c.sales)}</b>
        </div>
        <div>
          <span>来店 / 客単価</span>
          <b>
            {n1(r.visitors)}人 / {yen(c.per)}
          </b>
        </div>
        <div>
          <span>粗利益</span>
          <b>{yen(c.gross)}</b>
        </div>
      </div>
      <div class="res">
        <div>
          <span>原価</span>
          <b>{yen(c.cogs)}</b>
        </div>
        <div>
          <span>手数料</span>
          <b>{yen(c.fees)}</b>
        </div>
        <div>
          <span>出店料+交通費</span>
          <b>{yen(c.exp)}</b>
        </div>
      </div>
      <div class="res one">
        <div class={c.net < 0 ? "neg" : ""}>
          <span>差引利益(粗利益−手数料−出店料−交通費)</span>
          <b>{yen(c.net)}</b>
        </div>
      </div>
      <p class="mut">
        手数料: 現金{yen(r.cash)}→{yen((r.cash * cfg.cash) / 100)} / カード{yen(r.card)}→{yen((r.card * cfg.card) / 100)} / 電子マネー
        {yen(r.emoney)}→{yen((r.emoney * cfg.emoney) / 100)} / QR{yen(r.qr)}→{yen((r.qr * cfg.qr) / 100)}
      </p>
      <p class="mut">
        売れた数: {r.items.map((i) => `${i.name} ${n1(soldOf(i))}(ロス${n1(i.loss)})`).join("、") || "なし"}
        。販売価格で計算した目安の売上は{yen(eventReferenceSales(r))}です。
      </p>
    </div>
  );
}

function EvDetail({ s }: { s: Schedule }) {
  const d = useData();
  const r = d.events.find((x) => x.sid === s.id);
  const [D, setD] = useState<Draft>(() => loadDraft(r));
  const latest = useRef(D);
  latest.current = D;
  const num = (k: Exclude<keyof Draft, "memo" | "items">, label: string) => (
    <NumField label={label} value={D[k]} blankZero placeholder="0" onCommit={(v) => setD((x) => ({ ...x, [k]: v }))} />
  );
  const setItem = (id: string, k: "sold" | "loss", v: number) =>
    setD((x) => ({ ...x, items: { ...x.items, [id]: { ...x.items[id], [k]: v } } }));

  const save = () => {
    // 入力中の欄があれば確定させてから保存する
    (document.activeElement as HTMLElement | null)?.blur();
    setTimeout(() => {
      {
        const cur = latest.current;
        const data = store.data;
        const mat = matLookup(data.mats);
        const old = data.events.find((x) => x.sid === s.id);
        const items = buildEventItems(data.prods, cur.items, mat);
        const after = applyEventStock(data.prods, old?.items ?? [], items);
        const rec: EventRecord = {
          id: old?.id ?? uid(),
          sid: s.id,
          date: s.date,
          name: s.name,
          fee: cur.fee,
          trans: cur.trans,
          visitors: cur.visitors,
          cash: cur.cash,
          card: cur.card,
          emoney: cur.emoney,
          qr: cur.qr,
          memo: cur.memo,
          items,
        };
        const ops: Op[] = [
          old ? { t: "patch", col: "events", id: old.id, patch: rec as unknown as Record<string, unknown> } : { t: "add", col: "events", item: rec },
          ...Object.entries(after).map(([id, v]) => ({
            t: "incr" as const,
            col: "prods" as const,
            id,
            field: "stock",
            delta: v - data.prods.find((p) => p.id === id)!.stock,
          })),
        ];
        store.apply(ops);
        toast("記録を保存しました");
        window.scrollTo(0, 0);
      }
    }, 0);
  };

  return (
    <>
      <button style={{ marginBottom: "10px" }} onClick={() => go.event(null)}>
        ← イベント一覧
      </button>
      <h1 style={{ marginBottom: "2px" }}>{s.name}</h1>
      <p class="mut" style={{ margin: "0 0 12px" }}>
        {schedTime(s)}
      </p>
      {r && <Result r={r} />}
      <div class="card">
        <h2>{r ? "記録を編集" : "売上と出店の記録"}</h2>
        <div class="grid">
          {num("visitors", "来店人数")}
          {num("fee", "出店料(円)")}
          {num("trans", "交通費(円)")}
        </div>
        <h2>支払い方法別の売上(Square)</h2>
        <div class="grid">
          {num("cash", "現金")}
          {num("card", "カード")}
          {num("emoney", "電子マネー・交通系")}
          {num("qr", "QR(PayPay等)")}
        </div>
        <h2>商品ごとの売れた数・ロス数</h2>
        {d.prods.map((p) => {
          const it = D.items[p.id] || {};
          return (
            <div class="line sold" key={p.id}>
              <span>
                {p.name}
                <br />
                <small>在庫 {n1(p.stock)}</small>
              </span>
              <NumField label="" inputMode="numeric" placeholder="売れた" blankZero value={it.sold || 0} onCommit={(v) => setItem(p.id, "sold", v)} />
              <NumField label="" inputMode="numeric" placeholder="ロス" blankZero value={it.loss || 0} onCommit={(v) => setItem(p.id, "loss", v)} />
            </div>
          );
        })}
        <p class="mut">保存すると、売れた数とロス数の合計ぶん、商品の在庫が減ります。</p>
        <label class="mut" style={{ display: "block", marginTop: "8px" }}>
          振り返り(反省点・良かったこと・嬉しかったこと)
          <textarea placeholder="自由に書いてください" value={D.memo} onInput={(e) => {
            const memo = e.currentTarget.value;
            setD((x) => ({ ...x, memo }));
          }} />
        </label>
        <button class="pri" style={{ marginTop: "12px", width: "100%" }} onClick={save}>
          記録を保存
        </button>
      </div>
      <DelButton
        label="このイベントを削除"
        onConfirm={() => {
          const data = store.data;
          const back = r ? applyEventStock(data.prods, r.items, []) : {};
          store.apply([
            ...Object.entries(back).map(([id, v]) => ({
              t: "incr" as const,
              col: "prods" as const,
              id,
              field: "stock",
              delta: v - data.prods.find((p) => p.id === id)!.stock,
            })),
            ...(r ? [{ t: "del" as const, col: "events" as const, id: r.id }] : []),
            { t: "del", col: "sched", id: s.id },
          ]);
          go.event(null);
          toast("削除しました");
        }}
      />
    </>
  );
}

export function Events() {
  const r = useRoute();
  const d = useData();
  const s = r.evSel ? d.sched.find((x) => x.id === r.evSel) : undefined;
  return s ? <EvDetail key={s.id} s={s} /> : <EvList />;
}
