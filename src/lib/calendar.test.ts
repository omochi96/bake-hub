import { describe, expect, it } from "vitest";
import { addMonth, itemsByDay, monthCells } from "./calendar";

describe("カレンダーのマス", () => {
  it("2026年11月は日曜はじまりで、1日が日曜。5行", () => {
    const c = monthCells(2026, 11);
    expect(c[0]).toBe("2026-11-01");
    expect(c.length).toBe(35);
    expect(c.filter(Boolean).length).toBe(30);
  });
  it("2026年2月は日曜から始まる28日で、ちょうど4行", () => {
    const c = monthCells(2026, 2);
    expect(c.length).toBe(28);
    expect(c[0]).toBe("2026-02-01");
  });
  it("前の月の分は空き(2026年12月1日は火曜)", () => {
    const c = monthCells(2026, 12);
    expect(c.slice(0, 3)).toEqual([null, null, "2026-12-01"]);
  });
  it("月の足し引きで年をまたぐ", () => {
    expect(addMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
  });
});

describe("日ごとの予定", () => {
  it("出店予定(時刻順)のあとに製造予定。イベントタブの予定がそのまま入る", () => {
    const m = itemsByDay(
      [
        { id: "s2", date: "2026-11-26", name: "午後の市", place: "", start: "13:00", end: "" },
        { id: "s1", date: "2026-11-26", name: "たねまきマルシェ", place: "あべのキューズモール", start: "11:00", end: "16:00" },
      ],
      [{ id: "p1", date: "2026-11-26", prod: "x", title: "宇治抹茶", qty: 30, done: true }],
    );
    const d = m.get("2026-11-26")!;
    expect(d.map((x) => x.label)).toEqual(["たねまきマルシェ", "午後の市", "宇治抹茶 ×30"]);
    expect(d[0].sub).toBe("11:00〜16:00・あべのキューズモール");
    expect(d[2]).toMatchObject({ kind: "plan", done: true });
    expect(m.has("2026-11-27")).toBe(false);
  });
});
