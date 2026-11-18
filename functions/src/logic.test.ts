import { describe, expect, it } from "vitest";
import {
  baseExtItems,
  baseMonthly,
  baseOrderToSale,
  baseStockDelta,
  jstDate,
  searchFromDate,
  sqExtItems,
  sqOrderToSale,
  tenderKind,
  type OSale,
} from "./logic";

describe("jstDate", () => {
  it("日本時間の日付にする", () => {
    expect(jstDate("2026-11-17T15:30:00Z")).toBe("2026-11-18");
    expect(jstDate("2026-11-17T14:59:59Z")).toBe("2026-11-17");
  });
});

describe("BASE", () => {
  const order = {
    unique_key: "ABC123",
    ordered_at: "2026-11-18T03:00:00Z",
    amounts: { total: 2380 },
    lines: [
      { item_id: 10, variation_id: null, title: "チョコチャンク", price: 400, amount: 2, status: "ordered" },
      { item_id: 20, variation_id: 5, title: "グラノーラ", variation: "120g", price: 980, amount: 1, status: "ordered" },
      { item_id: 30, title: "キャンセル品", price: 500, amount: 1, status: "cancelled" },
    ],
  };
  it("キャンセルされた明細を除いて取り込む", () => {
    const s = baseOrderToSale(order);
    expect(s.id).toBe("base-ABC123");
    expect(s.date).toBe("2026-11-18");
    expect(s.total).toBe(2380);
    expect(s.lines.map((l) => l.ext)).toEqual(["base:10", "base:20:5"]);
    expect(s.lines[1].name).toBe("グラノーラ(120g)");
  });
  it("在庫は 数量 × 入数(グラムは1袋の重さ)。種類の対応がなければ商品全体の対応を使う", () => {
    const s = baseOrderToSale(order);
    const d = baseStockDelta(s, [
      { id: "p1", baseItem: "base:10" },
      { id: "p2", baseItem: "base:20", pc: 120 },
    ]);
    expect(d).toEqual({ p1: 2, p2: 120 });
  });
  it("対応づけのない明細は数えない", () => {
    expect(baseStockDelta(baseOrderToSale(order), [])).toEqual({});
  });
  it("2枚セットは2倍", () => {
    expect(baseStockDelta(baseOrderToSale(order), [{ id: "p1", baseItem: "base:10", pc: 2 }])).toEqual({ p1: 4 });
  });
  it("商品の一覧: 種類が2つ以上なら種類ごと", () => {
    const xs = baseExtItems([
      { id: 10, name: "チョコ", price: 400 },
      { id: 20, name: "グラノーラ", price: 980, variations: [{ id: 5, name: "120g" }, { id: 6, name: "240g", price: 1800 }] },
      { id: 30, name: "1種類", price: 300, variations: [{ id: 7, name: "通常" }] },
    ]);
    expect(xs.map((x) => [x.ext, x.name, x.price])).toEqual([
      ["base:10", "チョコ", 400],
      ["base:20:5", "グラノーラ(120g)", 980],
      ["base:20:6", "グラノーラ(240g)", 1800],
      ["base:30", "1種類", 300],
    ]);
    expect(xs[1].id).toBe("base-20-5");
  });
  it("月別の合計はキャンセルを除く", () => {
    const mk = (date: string, total: number, cancelled?: true): OSale => ({ id: date + total, src: "base", oid: "", at: "", date, total, lines: [], cancelled });
    expect(baseMonthly([mk("2026-11-01", 1000), mk("2026-11-20", 500), mk("2026-11-21", 900, true), mk("2026-12-01", 300)])).toEqual({
      "2026-11": { sales: 1500, orders: 2 },
      "2026-12": { sales: 300, orders: 1 },
    });
  });
  it("検索の開始日は最長で約1年前", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(searchFromDate("2026-11-17T20:00:00Z", now)).toBe("2026-11-18");
    expect(searchFromDate("2020-01-01T00:00:00Z", now)).toBe("2025-11-23");
  });
});

describe("Square", () => {
  it("支払い方法の振り分け", () => {
    expect(tenderKind({ type: "CASH" })).toBe("cash");
    expect(tenderKind({ type: "CARD", card_details: { card: { card_brand: "VISA" } } })).toBe("card");
    expect(tenderKind({ type: "CARD", card_details: { card: { card_brand: "FELICA_TRANSPORTATION" } } })).toBe("emoney");
    expect(tenderKind({ type: "WALLET" })).toBe("qr");
    expect(tenderKind({ type: "OTHER" })).toBe("card");
  });
  it("注文を取り込む形にする", () => {
    const s = sqOrderToSale({
      id: "O1",
      closed_at: "2026-11-22T02:00:00Z",
      total_money: { amount: 1200 },
      line_items: [
        { name: "チョコチャンク", variation_name: "Regular", quantity: "2", catalog_object_id: "V1", base_price_money: { amount: 400 } },
        { name: "カスタム", quantity: "1", base_price_money: { amount: 400 } },
      ],
      tenders: [
        { type: "CASH", amount_money: { amount: 800 } },
        { type: "CARD", amount_money: { amount: 400 }, card_details: { card: { card_brand: "FELICA_ID" } } },
      ],
    });
    expect(s.id).toBe("sq-O1");
    expect(s.date).toBe("2026-11-22");
    expect(s.pay).toEqual({ cash: 800, card: 0, emoney: 400, qr: 0 });
    expect(s.lines).toEqual([
      { ext: "sq:V1", name: "チョコチャンク", qty: 2, price: 400 },
      { ext: "sq:custom:カスタム", name: "カスタム", qty: 1, price: 400 },
    ]);
  });
  it("商品の一覧: バリエーションごと(1つなら商品名だけ)", () => {
    const xs = sqExtItems([
      { type: "ITEM", id: "I1", item_data: { name: "チョコ", variations: [{ id: "V1", item_variation_data: { name: "Regular", price_money: { amount: 400 } } }] } },
      {
        type: "ITEM",
        id: "I2",
        item_data: {
          name: "グラノーラ",
          variations: [
            { id: "V2", item_variation_data: { name: "120g", price_money: { amount: 980 } } },
            { id: "V3", item_variation_data: { name: "240g", price_money: { amount: 1800 } } },
          ],
        },
      },
      { type: "ITEM", id: "I3", is_deleted: true, item_data: { name: "消えた" } },
    ]);
    expect(xs.map((x) => [x.ext, x.name, x.price])).toEqual([
      ["sq:V1", "チョコ", 400],
      ["sq:V2", "グラノーラ(120g)", 980],
      ["sq:V3", "グラノーラ(240g)", 1800],
    ]);
  });
});
