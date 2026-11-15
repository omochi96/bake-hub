// 材料の種類分け・よく使う順・検索(SPEC.md 3章「材料」)
import type { Material, Product } from "./types";

/** 材料の種類。この順に並べる */
export const MAT_CATS = [
  "粉・穀物",
  "砂糖・甘味",
  "乳製品・油脂",
  "卵",
  "チョコ・ココア",
  "ナッツ・フルーツ・野菜",
  "抹茶・コーヒー・茶",
  "スパイス・塩・洋酒",
  "膨張剤・製菓材料",
  "包材",
  "その他",
] as const;
export type MatCat = (typeof MAT_CATS)[number];

/** 名前から種類を推測するための言葉。上から順に調べる(「アーモンドプードル」を粉より先にナッツにする、など) */
const RULES: [MatCat, RegExp][] = [
  ["包材", /袋|シール|ラベル|リボン|乾燥剤|脱酸素|opp|カップ|箱|ケース|テープ/],
  ["卵", /卵|たまご|玉子|全卵/],
  ["チョコ・ココア", /チョコ|ショコラ|カカオ|ココア|カレボー|ヴァローナ|クーベル|ガナッシュ/],
  ["抹茶・コーヒー・茶", /抹茶|紅茶|アールグレイ|エスプレッソ|コーヒー|珈琲|ほうじ茶|茶葉|インスタントコーヒー/],
  ["膨張剤・製菓材料", /ベーキング|重曹|イースト|ゼラチン|アガー|寒天|ペクチン|色素|アイシング/],
  [
    "ナッツ・フルーツ・野菜",
    /ナッツ|アーモンド|くるみ|クルミ|胡桃|ウォールナット|カシュー|ピーカン|ヘーゼル|マカダミア|ピスタチオ|ココナッツ|レーズン|いちじく|イチジク|無花果|クランベリー|ブルーベリー|フルーツ|ドライ|ピール|レモン|オレンジ|ゆず|柚子|りんご|リンゴ|バナナ|いちご|苺|にんじん|人参|かぼちゃ|南瓜|さつまいも|芋|ごま|胡麻|セサミ/,
  ],
  ["スパイス・塩・洋酒", /シナモン|ナツメグ|ジンジャー|生姜|しょうが|カルダモン|クローブ|オールスパイス|スパイス|バニラ|塩$|岩塩|ラム酒|ラム$|洋酒|ブランデー|キルシュ|リキュール|エッセンス|香料|ペッパー|胡椒/],
  ["砂糖・甘味", /砂糖|糖|グラニュー|はちみつ|蜂蜜|ハチミツ|メープル|シロップ|水飴|水あめ|ジャム/],
  ["乳製品・油脂", /バター|クリーム|牛乳|ミルク|チーズ|ヨーグルト|豆乳|練乳|スキム|脱脂|油|オイル|ショートニング|マーガリン|ラード/],
  ["粉・穀物", /粉|小麦|強力|薄力|中力|全粒|ドゥノール|リスドォル|オート|オーツ|グラノーラ|コーンスターチ|片栗|米粉|コーンミール|ふすま/],
];

/** 種類を推測する。当てはまらなければ「その他」 */
export function guessCat(name: string): MatCat {
  const s = normalize(name);
  for (const [cat, re] of RULES) if (re.test(name) || re.test(s)) return cat;
  return "その他";
}

/** 材料の種類。店主が選んだものがあればそれ、なければ名前から推測 */
export function matCat(m: Pick<Material, "name" | "cat">): MatCat {
  return m.cat && (MAT_CATS as readonly string[]).includes(m.cat) ? (m.cat as MatCat) : guessCat(m.name);
}

/** 材料idごとに、使っているルセットの数 */
export function usageCount(prods: Pick<Product, "lines">[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of prods) for (const id of new Set(p.lines.map((l) => l.m))) c[id] = (c[id] ?? 0) + 1;
  return c;
}

/** よく使う順(同じなら元の並び) */
export function byUsage<T extends Pick<Material, "id">>(mats: T[], use: Record<string, number>): T[] {
  return mats
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (use[b.m.id] ?? 0) - (use[a.m.id] ?? 0) || a.i - b.i)
    .map((x) => x.m);
}

/** 種類ごとにまとめる。種類は決まった順、中はよく使う順。空の種類は出さない */
export function groupMats<T extends Pick<Material, "id" | "name" | "cat">>(
  mats: T[],
  use: Record<string, number>,
): { cat: MatCat; mats: T[] }[] {
  const sorted = byUsage(mats, use);
  return MAT_CATS.map((cat) => ({ cat, mats: sorted.filter((m) => matCat(m) === cat) })).filter((g) => g.mats.length);
}

/** 検索用に文字をそろえる(全角半角、大文字小文字、カタカナ→ひらがな) */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

/** よく使う漢字の読み。ひらがなで打っても見つかるようにする */
const READINGS: [string, string][] = [
  ["抹茶", "まっちゃ"], ["宇治", "うじ"], ["有機", "ゆうき"], ["人参", "にんじん"], ["南瓜", "かぼちゃ"],
  ["無花果", "いちじく"], ["胡桃", "くるみ"], ["胡麻", "ごま"], ["苺", "いちご"], ["柚子", "ゆず"],
  ["紅茶", "こうちゃ"], ["珈琲", "こーひー"], ["焙じ茶", "ほうじちゃ"], ["生姜", "しょうが"], ["黒糖", "こくとう"],
  ["砂糖", "さとう"], ["粉糖", "ふんとう"], ["蜂蜜", "はちみつ"], ["薄力粉", "はくりきこ"], ["強力粉", "きょうりきこ"],
  ["全粒粉", "ぜんりゅうふん"], ["米粉", "こめこ"], ["片栗粉", "かたくりこ"], ["牛乳", "ぎゅうにゅう"], ["豆乳", "とうにゅう"],
  ["生クリーム", "なまくりーむ"], ["卵黄", "らんおう"], ["卵白", "らんぱく"], ["全卵", "ぜんらん"], ["卵", "たまご"],
  ["塩", "しお"], ["期間限定", "きかんげんてい"], ["焼き菓子", "やきがし"], ["生菓子", "なまがし"], ["雑貨", "ざっか"],
];

/** 名前と、漢字を読みに置きかえた名前(「まっちゃ」で「宇治抹茶」も見つかる) */
function searchForms(name: string): string[] {
  let r = name;
  for (const [k, v] of READINGS) r = r.split(k).join(v);
  return r === name ? [normalize(name)] : [normalize(name), normalize(r)];
}

/** 名前に検索語が含まれるか(「ばたー」で「バター」も、「まっちゃ」で「宇治抹茶」も見つかる) */
export function matchName(name: string, q: string): boolean {
  const k = normalize(q);
  return !k || searchForms(name).some((f) => f.includes(k));
}

/** 予測入力の候補。名前の先頭が合うものを先に、その中はよく使う順 */
export function suggestMats<T extends Pick<Material, "id" | "name">>(mats: T[], q: string, use: Record<string, number>, limit = 8): T[] {
  const k = normalize(q);
  const hit = byUsage(
    mats.filter((m) => matchName(m.name, q)),
    use,
  );
  if (!k) return hit.slice(0, limit);
  const head = hit.filter((m) => normalize(m.name).startsWith(k));
  const rest = hit.filter((m) => !normalize(m.name).startsWith(k));
  return [...head, ...rest].slice(0, limit);
}
