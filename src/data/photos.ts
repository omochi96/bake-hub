// 初期の商品写真。商品名の一部(キー)で、最初の1回だけ商品に割り当てる。
// 割り当てたあとは商品idにひも付く(SPEC.md 11章)。
import chocoChunk from "../assets/photos/choco-chunk.jpg";
import oatmeal from "../assets/photos/oatmeal.jpg";
import carrot from "../assets/photos/carrot.jpg";
import espresso from "../assets/photos/espresso.jpg";
import pumpkin from "../assets/photos/pumpkin.jpg";
import matcha from "../assets/photos/matcha.jpg";
import fig from "../assets/photos/fig.jpg";
import cocoa from "../assets/photos/cocoa.jpg";
import raisin from "../assets/photos/raisin.jpg";

/** [キー, 初期の商品名, 写真] 旧版の PH と同じ順 */
export const BUILTIN: [string, string, string][] = [
  ["チョコチャンク", "チョコチャンククッキー", chocoChunk],
  ["オートミール", "オートミールとココナッツ", oatmeal],
  ["にんじん", "有機にんじん", carrot],
  ["エスプレッソ", "エスプレッソ", espresso],
  ["かぼちゃ", "【期間限定】かぼちゃケーキ", pumpkin],
  ["抹茶", "宇治抹茶", matcha],
  ["いちじく", "【期間限定】有機いちじくとアールグレイ", fig],
  ["ココア", "ココアとアーモンド", cocoa],
  ["レーズン", "有機レーズンとカシューナッツ", raisin],
];

const BY_KEY = new Map(BUILTIN.map(([k, , url]) => [k, url]));

/** 保存してある写真の値を、表示できるURLに。"builtin:キー" か data URL */
export function photoUrl(v: string | undefined): string {
  if (!v) return "";
  if (v.startsWith("builtin:")) return BY_KEY.get(v.slice(8)) ?? "";
  return v;
}

/** 商品名からキーを探す(旧版の photo() と同じ規則) */
export function builtinKeyFor(name: string): string | undefined {
  return BUILTIN.find(([k]) => name.includes(k))?.[0];
}
