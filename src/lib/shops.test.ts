import { describe, expect, it } from "vitest";
import { bestMatch, squareFill, suggestOrder, unlinked } from "./shops";
import type { ExtItem, OSale } from "./types";

const sq = (date: string, extra: Partial<OSale> = {}): OSale => ({
  id: "sq-" + Math.random(),
  src: "square",
  oid: "",
  at: "",
  date,
  total: 1200,
  pay: { cash: 800, card: 0, emoney: 400, qr: 0 },
  lines: [
    { ext: "sq:V1", name: "チョコ", qty: 2, price: 400 },
    { ext: "sq:V9", name: "ドリンク", qty: 1, price: 400 },
  ],
  ...extra,
});

describe("squareFill", () => {
  it("その日のSquareの売上を合計し、対応づけた商品の売れた数を出す", () => {
    const r = squareFill(
      [sq("2026-11-22"), sq("2026-11-22"), sq("2026-11-23"), sq("2026-11-22", { cancelled: true }), { ...sq("2026-11-22"), src: "base" }],
      [{ id: "p1", sqItem: "sq:V1" }],
      "2026-11-22",
    );
    expect(r.n).toBe(2);
    expect(r.total).toBe(2400);
    expect(r.pay).toEqual({ cash: 1600, card: 0, emoney: 800, qr: 0 });
    expect(r.sold).toEqual({ p1: 4 });
    expect(r.unknown).toEqual([{ name: "ドリンク", qty: 2 }]);
  });
});

const ext = (name: string, e: string, src: "base" | "square" = "base"): ExtItem => ({ id: e, src, ext: e, name, price: 0 });

describe("対応づけ", () => {
  const xs = [ext("【期間限定】かぼちゃケーキ", "base:1"), ext("チョコチャンククッキー", "base:2"), ext("宇治抹茶", "base:3"), ext("チョコ", "sq:1", "square")];
  it("対応づけていないものだけ", () => {
    expect(unlinked(xs, [{ baseItem: "base:2" }], "base").map((x) => x.ext)).toEqual(["base:1", "base:3"]);
  });
  it("名前が合うものを先に", () => {
    expect(suggestOrder(xs.slice(0, 3), "宇治抹茶")[0].ext).toBe("base:3");
    expect(suggestOrder(xs.slice(0, 3), "かぼちゃケーキ")[0].ext).toBe("base:1");
  });
  it("1つだけ合えば自動の候補にする", () => {
    expect(bestMatch(xs.slice(0, 3), "かぼちゃケーキ")?.ext).toBe("base:1");
    expect(bestMatch(xs.slice(0, 3), "ココア")).toBeNull();
  });
});
