// 予定(スケジュール)。月のカレンダーに、出店予定と製造予定を表示する。
// 出店予定はイベントタブで入れたものをそのまま使う(ここでは保存しない)。
import { useState } from "preact/hooks";
import sheepImg from "../assets/sheep.jpg";
import { store, useData } from "../data/store";
import {
  addMonth,
  itemsByDay,
  monthCells,
  type DayItem,
} from "../lib/calendar";
import { num, today, uid } from "../lib/format";
import { sortProds } from "../lib/order";
import { GOODS, RECIPE_GENRES, type Plan } from "../lib/types";
import { DelButton, toast } from "../ui/parts";
import { BakeList, ProduceForm } from "../ui/Produce";
import { go } from "../ui/router";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 見ている月と選んだ日(タブを移っても覚えておく。保存はしない) */
const td0 = today();
let view = { y: +td0.slice(0, 4), m: +td0.slice(5, 7) };
let picked = td0;

function dayLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}

/** 製造予定の追加。商品と作る数の行をいくつでも足して、まとめて入れる */
type Row = { prod: string; title: string; qty: string };
const blank = (): Row => ({ prod: "", title: "", qty: "" });

function AddPlan({ date }: { date: string }) {
  const d = useData();
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [memo, setMemo] = useState("");
  const prods = d.prods.filter((p) => p.genre !== GOODS);
  const groups = RECIPE_GENRES.map((g) => ({ g, ps: sortProds(prods.filter((p) => p.genre === g)) })).filter((x) => x.ps.length);
  const put = (i: number, x: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...x } : r)));
  const add = () => {
    const items: Plan[] = [];
    for (const r of rows) {
      const p = d.prods.find((x) => x.id === r.prod);
      const name = p ? p.name : r.title.trim();
      if (!name) continue;
      items.push({ id: uid(), date, prod: p ? p.id : "", title: name, qty: num(r.qty), memo: memo.trim() });
    }
    if (!items.length) return toast("商品を選ぶか、名前を入れてください");
    store.apply(items.map((item) => ({ t: "add" as const, col: "plans" as const, item })));
    setRows([blank()]);
    setMemo("");
    toast(`${dayLabel(date)}に${items.length}件の製造予定を入れました`);
  };
  return (
    <div class="plan-add">
      <h2>製造予定を追加</h2>
      {rows.map((r, i) => (
        <div class="plan-row" key={i}>
          <div class="pr-main">
            <select value={r.prod} aria-label="商品" onChange={(e) => put(i, { prod: e.currentTarget.value })}>
              <option value="">一覧にない(名前を入力)</option>
              {groups.map(({ g, ps }) => (
                <optgroup key={g} label={g}>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!r.prod && <input placeholder="名前(例: 生地の仕込み)" value={r.title} onInput={(e) => put(i, { title: e.currentTarget.value })} />}
          </div>
          <input
            class="pr-qty"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="数"
            aria-label="作る数"
            value={r.qty}
            onInput={(e) => put(i, { qty: e.currentTarget.value })}
          />
          {rows.length > 1 && (
            <button class="pr-del" aria-label="この行を消す" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
              ×
            </button>
          )}
        </div>
      ))}
      <button onClick={() => setRows((rs) => [...rs, blank()])}>＋商品を追加</button>
      <label class="mut" style={{ display: "block", marginTop: "10px" }}>
        メモ(全部に付きます)
        <input placeholder="任意" value={memo} onInput={(e) => setMemo(e.currentTarget.value)} />
      </label>
      <button class="pri" style={{ marginTop: "10px" }} onClick={add}>
        予定に入れる
      </button>
    </div>
  );
}

function ItemRow({ it, date }: { it: DayItem; date: string }) {
  const d = useData();
  const [rec, setRec] = useState(false);
  if (it.kind === "bake") {
    const b = (d.bakes ?? []).find((x) => x.id === it.id);
    return b ? <BakeList bakes={[b]} showDate={false} /> : null;
  }
  if (it.kind === "event")
    return (
      <button class="ditem ev" onClick={() => go.event(it.id)}>
        <i>出店</i>
        <span>
          <b>{it.label}</b>
          {it.sub && <small>{it.sub}</small>}
        </span>
        <span class="go">記録 ›</span>
      </button>
    );
  const prod = d.prods.find((p) => p.id === it.prod);
  return (
    <>
      <div class={"ditem pl" + (it.done ? " done" : "")}>
        <label class="chk">
          <input
            type="checkbox"
            checked={it.done}
            aria-label="済んだ"
            onChange={(e) =>
              store.apply([
                {
                  t: "patch",
                  col: "plans",
                  id: it.id,
                  patch: { done: e.currentTarget.checked },
                },
              ])
            }
          />
        </label>
        <span>
          <b>{it.label}</b>
          {it.sub && <small>{it.sub}</small>}
        </span>
        {prod && !it.done && (
          <button class={rec ? "on" : ""} onClick={() => setRec(!rec)}>
            {rec ? "閉じる" : "作成を記録"}
          </button>
        )}
        <DelButton
          label="削除"
          armedLabel="もう一度"
          onConfirm={() => store.apply([{ t: "del", col: "plans", id: it.id }])}
        />
      </div>
      {rec && prod && (
        <div class="rec-box">
          <ProduceForm
            p={prod}
            date={date}
            plan={it.id}
            qty={it.qty}
            onDone={() => setRec(false)}
          />
        </div>
      )}
    </>
  );
}

export function Schedule() {
  const d = useData();
  const [v, setV] = useState(view);
  const [sel, setSel] = useState(picked);
  const td = today();
  const move = (delta: number) => {
    view = addMonth(v.y, v.m, delta);
    setV(view);
  };
  const pick = (date: string) => {
    picked = date;
    setSel(date);
  };
  const goToday = () => {
    view = { y: +td.slice(0, 4), m: +td.slice(5, 7) };
    setV(view);
    pick(td);
  };
  const by = itemsByDay(d.sched, d.plans ?? [], d.bakes ?? []);
  const cells = monthCells(v.y, v.m);
  const items = by.get(sel) ?? [];
  return (
    <>
      <div class="ph" style={{ marginBottom: "12px" }}>
        <h1>スケジュール</h1>
        <div class="pic">
          <img src={sheepImg} alt="" />
        </div>
      </div>
      <div class="card cal">
        <div class="cal-head">
          <button aria-label="前の月" onClick={() => move(-1)}>
            ‹
          </button>
          <b>
            {v.y}年{v.m}月
          </b>
          <button aria-label="次の月" onClick={() => move(1)}>
            ›
          </button>
          <button class="today" onClick={goToday}>
            今日
          </button>
        </div>
        <div class="cal-grid">
          {WEEK.map((w, i) => (
            <div
              key={w}
              class={"wd" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}
            >
              {w}
            </div>
          ))}
          {cells.map((c, i) =>
            c ? (
              <button
                key={c}
                class={
                  "day" +
                  (c === td ? " td" : "") +
                  (c === sel ? " sel" : "") +
                  (i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : "")
                }
                onClick={() => pick(c)}
                aria-label={dayLabel(c)}
              >
                <span class="n">{+c.slice(8)}</span>
                {(by.get(c) ?? []).slice(0, 3).map((it) => (
                  <span
                    key={it.id}
                    class={
                      "chip " +
                      (it.kind === "event"
                        ? "ev"
                        : it.kind === "plan"
                          ? "pl"
                          : "bk") +
                      (it.kind === "plan" && it.done ? " done" : "")
                    }
                  >
                    {it.label}
                  </span>
                ))}
                {(by.get(c)?.length ?? 0) > 3 && (
                  <span class="more">+{by.get(c)!.length - 3}</span>
                )}
              </button>
            ) : (
              <div key={"x" + i} class="day empty" />
            ),
          )}
        </div>
        <div class="legend">
          <span>
            <i class="chip ev" />
            出店予定(イベントタブ)
          </span>
          <span>
            <i class="chip pl" />
            製造予定
          </span>
          <span>
            <i class="chip bk" />
            作った記録
          </span>
        </div>
      </div>
      <div class="card">
        <h2>{dayLabel(sel)}</h2>
        {items.length ? (
          items.map((it) => <ItemRow key={it.id} it={it} date={sel} />)
        ) : (
          <p class="mut">この日の予定はありません。</p>
        )}
        <AddPlan date={sel} />
      </div>
    </>
  );
}
