// 表示用の書式(旧版の n1 / yen / y2 / today / uid と同じ)

export function n1(n: number): string {
  return Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function y2(n: number): string {
  return "¥" + Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

export function today(d = new Date()): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
}

/** 入力値を0以上の数に。数でなければ0 */
export function num(v: string | number): number {
  const x = parseFloat(String(v));
  return isNaN(x) || x < 0 ? 0 : x;
}

/** 日付の差(日) */
export function daysUntil(date: string, from: string): number {
  return Math.round((new Date(date).getTime() - new Date(from).getTime()) / 864e5);
}
