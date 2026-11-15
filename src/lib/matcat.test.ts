import { describe, expect, it } from "vitest";
import { groupMats, guessCat, matCat, matchName, suggestMats, usageCount } from "./matcat";

describe("材料の種類の推測", () => {
  it.each([
    ["薄力粉", "粉・穀物"],
    ["宝笠ドゥノール", "粉・穀物"],
    ["オートミール", "粉・穀物"],
    ["アーモンドプードル", "ナッツ・フルーツ・野菜"],
    ["有機砂糖", "砂糖・甘味"],
    ["粉糖", "砂糖・甘味"],
    ["バター", "乳製品・油脂"],
    ["食塩不使用バター", "乳製品・油脂"],
    ["生クリーム", "乳製品・油脂"],
    ["卵黄", "卵"],
    ["カレボー 811", "チョコ・ココア"],
    ["チャンクチョコ", "チョコ・ココア"],
    ["ココアパウダー", "チョコ・ココア"],
    ["カシューナッツ", "ナッツ・フルーツ・野菜"],
    ["ピーナッツバター", "ナッツ・フルーツ・野菜"],
    ["有機豆乳", "乳製品・油脂"],
    ["宇治抹茶", "抹茶・コーヒー・茶"],
    ["シナモン", "スパイス・塩・洋酒"],
    ["塩", "スパイス・塩・洋酒"],
    ["ゲランドの塩", "スパイス・塩・洋酒"],
    ["ベーキングパウダー", "膨張剤・製菓材料"],
    ["ドライイースト", "膨張剤・製菓材料"],
    ["OPP袋", "包材"],
    ["新しい材料", "その他"],
  ])("%s → %s", (name, cat) => {
    expect(guessCat(name)).toBe(cat);
  });

  it("店主が選んだ種類を優先する", () => {
    expect(matCat({ name: "バター", cat: "その他" })).toBe("その他");
    expect(matCat({ name: "バター", cat: "知らない種類" })).toBe("乳製品・油脂");
  });
});

const mats = [
  { id: "a", name: "薄力粉" },
  { id: "b", name: "バター" },
  { id: "c", name: "生クリーム" },
  { id: "d", name: "全粒粉" },
  { id: "e", name: "バニラビーンズ" },
];
const prods = [
  { lines: [{ m: "b", qty: 1 }, { m: "d", qty: 1 }, { m: "b", qty: 2 }] },
  { lines: [{ m: "b", qty: 1 }, { m: "c", qty: 1 }] },
];

describe("よく使う順と種類ごとのまとまり", () => {
  it("同じルセットで2回使っても1と数える", () => {
    expect(usageCount(prods)).toEqual({ b: 2, d: 1, c: 1 });
  });

  it("種類は決まった順、中はよく使う順", () => {
    const g = groupMats(mats, usageCount(prods));
    expect(g.map((x) => x.cat)).toEqual(["粉・穀物", "乳製品・油脂", "スパイス・塩・洋酒"]);
    expect(g[0].mats.map((m) => m.id)).toEqual(["d", "a"]);
    expect(g[1].mats.map((m) => m.id)).toEqual(["b", "c"]);
  });
});

describe("検索と予測入力", () => {
  it("ひらがな・カタカナ・全角半角の違いを気にしない", () => {
    expect(matchName("バター", "ばた")).toBe(true);
    expect(matchName("カレボー 811", "８１１")).toBe(true);
    expect(matchName("バター", "粉")).toBe(false);
  });

  it("よく使う漢字は、ひらがなの読みでも見つかる", () => {
    expect(matchName("宇治抹茶", "まっちゃ")).toBe(true);
    expect(matchName("有機にんじん", "ゆうき")).toBe(true);
    expect(matchName("【期間限定】有機いちじくとアールグレイ", "いちじく")).toBe(true);
    expect(matchName("薄力粉", "はくりき")).toBe(true);
    expect(matchName("宇治抹茶", "抹茶")).toBe(true);
  });

  it("先頭が合うものを先に、その中はよく使う順", () => {
    const use = usageCount(prods);
    expect(suggestMats(mats, "ば", use).map((m) => m.id)).toEqual(["b", "e"]);
    expect(suggestMats(mats, "粉", use).map((m) => m.id)).toEqual(["d", "a"]);
    expect(suggestMats(mats, "", use, 2).map((m) => m.id)).toEqual(["b", "c"]);
  });
});
