// データの形(SPEC.md 2章)。旧版の S と同じ項目名を使う。

export const GENRES = ["チャンククッキー", "焼き菓子", "グラノーラ", "生菓子", "雑貨", "ドリンク"] as const;
export type Genre = (typeof GENRES)[number];

/** ルセットのいらないジャンル(仕入れ品)。ルセットタブには出さず、原価は直接入力する */
export const GOODS = "雑貨";
/** ルセットのあるジャンル(ルセットタブの見出しの順) */
export const RECIPE_GENRES = GENRES.filter((g) => g !== GOODS);

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

/** 包装代の内訳(円/個) */
export interface Pack {
  /** ガス袋 */
  gas?: number;
  /** 脱酸素剤 */
  oxy?: number;
  /** シートドライヤー */
  dry?: number;
}

export interface RecipeLine {
  /** 材料id */
  m: string;
  /** 1回分の使用量 */
  qty: number;
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
  /** 包装代の内訳(円/個)。extra は「その他の包装代」 */
  pack?: Pack;
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
  seed1?: number;
  seed2?: number;
}
