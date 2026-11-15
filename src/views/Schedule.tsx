// 予定(スケジュール)。月のカレンダーに、出店予定と製造予定を表示する。
// 出店予定はイベントタブで入れたものをそのまま使う(ここでは保存しない)。
import { useState } from "preact/hooks";
import sheepImg from "../assets/sheep.jpg";
import { store, useData } from "../data/store";
import { addMonth, itemsByDay, monthCells, type DayItem } from "../lib/calendar";
import { num, today, uid } from "../lib/format";
import { GOODS, RECIPE_GENRES, type Plan } from "../lib/types";
import { DelButton, toast } from "../ui/parts";
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

/** 製造予定の追加 */
function AddPlan({ date }: { date: string }) {
  const d = useData();
  const [prod, setProd] = useState("");
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("");
  const [memo, setMemo] = useState("");
  const prods = d.prods.filter((p) => p.genre !== GOODS);
  const groups = [...RECIPE_GENRES.map((g) => ({ g, ps: prods.filter((p) => p.genre === g) }))].filter((x) => x.ps.length);
  const add = () => {
    const p = d.prods.find((x) => x.id === prod);
    const name = p ? p.name : title.trim();
    if (!name) return toast("商品を選ぶか、名前を入れてください");
    const item: Plan = { id: uid(), date, prod: p ? p.id : "", title: name, qty: num(qty), memo: memo.trim() };
    store.apply([{ t: "add", col: "plans", item }]);
    setQty("");
    setMemo("");
    setTitle("");
    toast(`${dayLabel(date)}に「${name}」を入れました`);
  };
  return (
    <div class="plan-add">
      <h2>製造予定を追加</h2>
      <div class="grid">
        <label class="full">
          商品
          <select value={prod} onChange={(e) => setProd(e.currentTarget.value)}>
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
        </label>
        {!prod && (
          <label class="full">
            名前
            <input placeholder="例: 生地の仕込み" value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>
        )}
        <label>
          作る数
          <input type="number" inputMode="numeric" min="0" placeholder="例: 30" value={qty} onInput={(e) => setQty(e.currentTarget.value)} />
        </label>
        <label>
          メモ
          <input placeholder="任意" value={memo} onInput={(e) => setMemo(e.currentTarget.value)} />
        </label>
      </div>
      <button class="pri" onClick={add}>
        予定に入れる
      </button>
    </div>
  );
}

function ItemRow({ it }: { it: DayItem }) {
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
  return (
    <div class={"ditem pl" + (it.done ? " done" : "")}>
      <label class="chk">
        <input
          type="checkbox"
          checked={it.done}
          aria-label="済んだ"
          onChange={(e) => store.apply([{ t: "patch", col: "plans", id: it.id, patch: { done: e.currentTarget.checked } }])}
        />
      </label>
      <span>
        <b>{it.label}</b>
        {it.sub && <small>{it.sub}</small>}
      </span>
      <DelButton label="削除" armedLabel="もう一度" onConfirm={() => store.apply([{ t: "del", col: "plans", id: it.id }])} />
    </div>
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
  const by = itemsByDay(d.sched, d.plans ?? []);
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
            <div key={w} class={"wd" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
              {w}
            </div>
          ))}
          {cells.map((c, i) =>
            c ? (
              <button
                key={c}
                class={"day" + (c === td ? " td" : "") + (c === sel ? " sel" : "") + (i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : "")}
                onClick={() => pick(c)}
                aria-label={dayLabel(c)}
              >
                <span class="n">{+c.slice(8)}</span>
                {(by.get(c) ?? []).slice(0, 3).map((it) => (
                  <span key={it.id} class={"chip " + (it.kind === "event" ? "ev" : "pl") + (it.kind === "plan" && it.done ? " done" : "")}>
                    {it.label}
                  </span>
                ))}
                {(by.get(c)?.length ?? 0) > 3 && <span class="more">+{by.get(c)!.length - 3}</span>}
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
        </div>
      </div>
      <div class="card">
        <h2>{dayLabel(sel)}</h2>
        {items.length ? items.map((it) => <ItemRow key={it.id} it={it} />) : <p class="mut">この日の予定はありません。</p>}
        <AddPlan date={sel} />
      </div>
    </>
  );
}
