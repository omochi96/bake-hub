// データの形(SPEC.md 2章)。旧版の S と同じ項目名を使う。

export const GENRES = ["チャンククッキー", "焼き菓子", "グラノーラ", "生菓子", "雑貨", "ドリンク", "生地・パーツ"] as const;
export type Genre = (typeof GENRES)[number];

/** ルセットのいらないジャンル(仕入れ品)。ルセットタブには出さず、原価は直接入力する */
export const GOODS = "雑貨";
/** 売らない、ほかのルセットの材料にする生地やクリーム(パートシュクレ、パータジェノワーズなど) */
export const PARTS = "生地・パーツ";
/** ルセットのあるジャンル(ルセットタブの見出しの順) */
export const RECIPE_GENRES = GENRES.filter((g) => g !== GOODS);
/** 売る商品のジャンル(商品一覧、イベントの売上入力、卸しの納品) */
export const SALE_GENRES = GENRES.filter((g) => g !== PARTS);

/** 希望の配分(売上を100%とした%) */
export interface Targets {
  cost: number;
  fee: number;
  event: number;
  rent: number;
  fixed: number;
}

export interface Config {
  /** Square 支払い方法別の手数料率(%) */
  cash: number;
  card: number;
  emoney: number;
  qr: number;
  /** BASE 手数料率(%) と 1注文あたりの固定額(円) */
  baseRate: number;
  baseFix: number;
  /** 卸の掛け率(%) */
  whole: number;
  /** 旧「目標原価率」。互換用 */
  target?: number;
  tg: Targets;
  /** キッチンレンタル月額(円) */
  rent: number;
  /** その他の固定費 月額(円) */
  fixed: number;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  packQty: number;
  packPrice: number;
  /** 在庫(unit) */
  qty: number;
  /** 発注点 */
  min: number;
  /** 材料の種類(粉・穀物、乳製品・油脂など)。なければ名前から推測する */
  cat?: string;
}

export interface RecipeLine {
  /** 材料id(生地やお菓子の行では "") */
  m: string;
  /** 1回分の使用量(生地はg、お菓子は枚数) */
  qty: number;
  /** 枠のid(メレンゲ、トッピングなど)。なければ本体 */
  sec?: string;
  /** 別のお菓子の生地を使う行: その商品id */
  d?: string;
  /** お菓子を入れる行(詰め合わせ): その商品id */
  c?: string;
  /** 卸し用の包装資材で、1ロットあたりの数のとき "lot"(なければ1枚あたり) */
  per?: "lot";
}

/** ルセットの枠(メレンゲ、トッピングなど) */
export interface RecipeSection {
  id: string;
  name: string;
  /** トッピング(作るときにオンにしたときだけ使う) */
  opt?: boolean;
}

export interface Product {
  id: string;
  genre: Genre | string;
  name: string;
  /** 1回の仕込み数 */
  yield: number;
  /** 1個あたりの包装代 */
  extra: number;
  /** 1個あたりの仕入れ値(雑貨など、ルセットのない商品の原価) */
  buy?: number;
  /** 1個あたりに使う包装資材(出店用)。extra は「その他の包装代」(円) */
  packs?: RecipeLine[];
  /** 1個あたりに使う包装資材(卸し用) */
  wpacks?: RecipeLine[];
  /** ルセットの枠 */
  secs?: RecipeSection[];
  /** 1回分の生地の重さ(g)。ほかのルセットで生地として使うとき。空なら材料から計算 */
  dough?: number;
  /** 詰め合わせ(BAKE BOXなど)。ルセットは「入れるお菓子と枚数」だけ。仕込み数は1(1箱ずつ) */
  box?: boolean;
  /** ルセットのメモ(作り方の注意事項など) */
  memo?: string;
  /** 卸しの1ロットの枚数(卸先ごとの指定がないとき) */
  wlot?: number;
  /** 販売の入数(1つ売るときに何枚入れるか。2枚セットなら2。なければ1) */
  pc?: number;
  /** 季節限定(ジャンルはそのままで、一覧では「季節限定」の別枠に出す) */
  season?: boolean;
  /** 完成品の在庫 */
  stock: number;
  /** 作成の目安 */
  min: number;
  price: number;
  whole: number;
  /** BASEでの販売価格(なし・0ならBASEでは売らない) */
  basePrice?: number;
  lines: RecipeLine[];
}

export interface Schedule {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  place: string;
  start: string; // HH:MM
  end: string;
}

export interface EventItem {
  /** 商品id */
  id: string;
  name: string;
  sold?: number;
  loss: number;
  /** sold + loss */
  out: number;
  /** 記録時点の包装代込み原価 */
  cost: number;
  /** 記録時点の販売価格 */
  price: number;
  /** 記録時点の販売の入数(sold・loss・out はセットの数。在庫は × 入数 で動く) */
  pc?: number;
}

export interface EventRecord {
  id: string;
  /** 出店予定のid */
  sid: string;
  date: string;
  name: string;
  fee: number;
  trans?: number;
  visitors: number;
  cash: number;
  card: number;
  emoney: number;
  qr: number;
  memo?: string;
  items: EventItem[];
}

/** 製造予定 */
export interface Plan {
  id: string;
  date: string; // YYYY-MM-DD
  /** 商品id。一覧から選ばなかったときは "" */
  prod: string;
  /** 表示名(商品名、または自由入力) */
  title: string;
  /** 作る数(0なら数なし) */
  qty: number;
  memo?: string;
  done?: boolean;
}

/** 作る目的。出店用か卸し用か */
export type BakeUse = "event" | "whole";

/** 製造記録(何をいくつ作ったか) */
export interface Bake {
  id: string;
  date: string; // YYYY-MM-DD
  /** 商品id */
  prod: string;
  /** 記録時点の商品名 */
  name: string;
  qty: number;
  use: BakeUse;
  /** 減らした材料と包装資材の量(材料id → 量)。記録を消すときに戻す */
  used: Record<string, number>;
  /** 減らしたお菓子の在庫(詰め合わせ。商品id → 数) */
  pused?: Record<string, number>;
  /** オンにしたトッピングの枠id */
  tops?: string[];
  /** 商品の在庫に足した数(出店用は qty、卸し用は 0) */
  stockAdd: number;
  /** 元になった製造予定のid */
  plan?: string;
  /** 卸し: 卸先id とロット数 */
  client?: string;
  lots?: number;
}

/** 卸先 */
export interface Client {
  id: string;
  name: string;
  memo?: string;
  /** 商品ごとの1ロットの枚数(商品id → 枚数)。なければ商品の wlot */
  lots?: Record<string, number>;
}

/** 卸しの納品1行 */
export interface WholeItem {
  prod: string;
  name: string;
  lots: number;
  /** 1ロットの枚数 */
  lot: number;
  /** 枚数 = lots × lot */
  qty: number;
  /** 記録時点の卸価格(1枚) */
  price: number;
  /** 記録時点の卸し用の原価(1枚) */
  cost: number;
}

/** 卸しの納品(売上) */
export interface WholeSale {
  id: string;
  date: string; // YYYY-MM-DD
  client: string;
  /** 記録時点の卸先の名前 */
  cname: string;
  items: WholeItem[];
  memo?: string;
  /** 製造記録から作ったときのid */
  bake?: string;
}

export interface BaseRecord {
  id: string;
  month: string; // YYYY-MM
  sales: number;
  orders: number;
}

/** アプリ全体のデータ(旧版の S) */
export interface AppData {
  cfg: Config;
  mats: Material[];
  prods: Product[];
  sched: Schedule[];
  events: EventRecord[];
  base: BaseRecord[];
  /** 製造予定 */
  plans: Plan[];
  /** 製造記録 */
  bakes: Bake[];
  /** 卸先 */
  clients: Client[];
  /** 卸しの納品 */
  wsales: WholeSale[];
  seed1?: number;
  seed2?: number;
}
