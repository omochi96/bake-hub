// カレンダーの計算(SPEC.md 3章「予定」)。画面から切り離した、入力だけで結果が決まる関数。
import type { Bake, Plan, Schedule } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" */
export function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 月を足し引きする(m は1〜12) */
export function addMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const i = y * 12 + (m - 1) + delta;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

/**
 * 月のカレンダーのマス(日曜はじまり)。前後の月の日は null。
 * 行の数は、その月に必要なだけ(4〜6行)。
 */
export function monthCells(y: number, m: number): (string | null)[] {
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(ymd(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export type DayItem =
  | { kind: "event"; id: string; label: string; sub: string }
  | { kind: "plan"; id: string; label: string; sub: string; done: boolean; prod: string; qty: number }
  | { kind: "bake"; id: string; label: string; sub: string };

/** 日付ごとの予定。出店予定(時刻順)、製造予定(登録順)、製造記録(作った分)の順 */
export function itemsByDay(sched: Schedule[], plans: Plan[], bakes: Bake[] = []): Map<string, DayItem[]> {
  const map = new Map<string, DayItem[]>();
  const push = (date: string, it: DayItem) => {
    if (!date) return;
    const xs = map.get(date) ?? [];
    xs.push(it);
    map.set(date, xs);
  };
  const ev = [...sched].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  for (const s of ev) {
    const time = s.start ? s.start + (s.end ? "〜" + s.end : "") : "";
    push(s.date, { kind: "event", id: s.id, label: s.name || "イベント", sub: [time, s.place].filter(Boolean).join("・") });
  }
  for (const p of plans) {
    push(p.date, {
      kind: "plan",
      id: p.id,
      label: p.title + (p.qty ? ` ×${p.qty}` : ""),
      sub: p.memo ?? "",
      done: !!p.done,
      prod: p.prod,
      qty: p.qty,
    });
  }
  for (const b of [...bakes].reverse()) {
    push(b.date, { kind: "bake", id: b.id, label: `${b.name} ${b.qty}個`, sub: b.use === "whole" ? "卸し" : "出店用" });
  }
  return map;
}
