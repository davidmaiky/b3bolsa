import type { Tx } from "./portfolio";

export const DIVIDEND_TYPES = ["DIVIDENDO", "JCP", "RENDIMENTO", "OUTRO"] as const;
export type DividendType = (typeof DIVIDEND_TYPES)[number];
export const DIVIDEND_LABEL: Record<string, string> = { DIVIDENDO: "Dividendo", JCP: "JCP", RENDIMENTO: "Rendimento", OUTRO: "Outro" };
/** IRRF sobre JCP no Brasil. */
export const JCP_TAX_RATE = 0.15;

export interface Div {
  date: Date | string;
  perShare: number;
  quantity: number;
  tax: number;
}

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export const grossOf = (d: Pick<Div, "perShare" | "quantity">) => d.perShare * d.quantity;
export const netOf = (d: Div) => grossOf(d) - d.tax;

/** Shares held when a dividend is declared: only trades strictly before the ex-date count. */
export function quantityAt(txs: Tx[], date: Date | string): number {
  const limit = day(date);
  return txs
    .filter((t) => day(t.date) < limit)
    .reduce((q, t) => q + (t.type === "BUY" ? t.quantity : -t.quantity), 0);
}

/** Net proceeds in the trailing window (default 12 months) ending at `now`. */
export function netSince(divs: Div[], now = new Date(), days = 365): number {
  const from = +now - days * 86_400_000;
  return divs.filter((d) => +new Date(d.date) >= from && +new Date(d.date) <= +now).reduce((s, d) => s + netOf(d), 0);
}

export const yieldOnCost = (net: number, cost: number) => (cost > 0 ? (net / cost) * 100 : undefined);

/** Sums net proceeds per calendar month (YYYY-MM) over the last `months` months, oldest first. */
export function monthlyNet(items: { date: Date | string; net: number }[], months = 12, now = new Date()) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const it of items) {
    const k = new Date(it.date).toISOString().slice(0, 7);
    if (sums.has(k)) sums.set(k, sums.get(k)! + it.net);
  }
  return keys.map((k) => ({ month: k, value: sums.get(k)! }));
}
