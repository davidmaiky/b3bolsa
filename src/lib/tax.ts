import type { AssetClass } from "./types";
import { forwardFill, type Close } from "./series";

/** Estimativa de IR sobre ganho de capital. Não substitui contador: veja os avisos devolvidos em `warnings`. */

export type TaxCategory = "ACAO" | "FII" | "CRIPTO" | "EXTERIOR";
export const CATEGORY_LABEL: Record<TaxCategory, string> = { ACAO: "Ações (B3)", FII: "FII/ETF (B3)", CRIPTO: "Criptomoedas", EXTERIOR: "Ativos no exterior" };

export const ACAO_EXEMPT_SALES = 20_000; // vendas mensais de ações até este valor: ganho isento
export const CRIPTO_EXEMPT_SALES = 35_000;
export const RATE = { ACAO: 0.15, FII: 0.2, CRIPTO: 0.15, EXTERIOR: 0.15 } as const;

/** B3 tickers ending in 11 are treated as FII/ETF (20%, no exemption). Units of companies end in 11 too: check the warning. */
export function categoryOf(assetClass: AssetClass, ticker: string): TaxCategory | null {
  if (assetClass === "B3") return /11$/.test(ticker.toUpperCase()) ? "FII" : "ACAO";
  if (assetClass === "CRYPTO") return "CRIPTO";
  if (assetClass === "US") return "EXTERIOR";
  return null; // moedas: fora do escopo
}

export interface TaxTx { type: string; quantity: number; price: number; fees?: number; date: Date | string }
export interface TaxAsset { ticker: string; assetClass: AssetClass; currency: string; txs: TaxTx[] }

export interface Sale {
  date: string;
  ticker: string;
  category: TaxCategory;
  quantity: number;
  grossBrl: number; // valor da venda
  costBrl: number;
  gainBrl: number;
}

export interface MonthRow {
  month: string; // YYYY-MM
  category: "ACAO" | "FII" | "CRIPTO";
  sales: number;
  gain: number;
  exempt: boolean;
  carryIn: number;
  lossUsed: number;
  carryOut: number;
  taxable: number;
  tax: number;
  due: string; // vencimento da DARF (código 6015)
}
export interface YearRow { year: number; gain: number; loss: number; net: number; tax: number }
export interface Holding { ticker: string; assetClass: AssetClass; category: TaxCategory | null; quantity: number; costBrl: number; costNative: number; currency: string }
export interface TaxResult {
  months: MonthRow[];
  years: YearRow[]; // ativos no exterior (apuração anual)
  sales: Sale[];
  warnings: string[];
}

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/** Last business day (Mon–Fri, holidays ignored) of the month after `month`. */
export function darfDue(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m + 1, 0)); // last day of month+1 (m is 1-based → index m = next month)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fxLookup(assets: TaxAsset[], fx: Close[]) {
  const needs = assets.some((a) => a.currency === "USD" && a.txs.length);
  if (needs && !fx.length) throw new Error("Cotação histórica do dólar indisponível no momento.");
  const dates = [...new Set(assets.flatMap((a) => a.txs.map((t) => day(t.date))))].sort();
  const filled = forwardFill(fx, dates);
  const map = new Map(dates.map((d, i) => [d, filled[i] ?? fx[0]?.close ?? 1]));
  return (cur: string, date: string) => (cur === "USD" ? map.get(date) ?? 1 : 1);
}

interface Replay { sales: Sale[]; holdings: (date: string) => Holding[]; dayTrades: string[] }

/** Replays each asset with a weighted-average cost kept in BRL (USD trades converted at that day's rate). */
function replay(assets: TaxAsset[], fx: Close[]): Replay {
  const rate = fxLookup(assets, fx);
  const sales: Sale[] = [];
  const dayTrades = new Set<string>();
  const states = assets.map((a) => ({ a, txs: [...a.txs].sort((x, y) => +new Date(x.date) - +new Date(y.date) || (x.type === "BUY" ? -1 : 1)) }));

  for (const { a, txs } of states) {
    const cat = categoryOf(a.assetClass, a.ticker);
    if (!cat) continue;
    let qty = 0;
    let costBrl = 0;
    for (const t of txs) {
      const d = day(t.date);
      const r = rate(a.currency, d);
      const fees = t.fees ?? 0;
      if (t.type === "BUY") {
        qty += t.quantity;
        costBrl += (t.quantity * t.price + fees) * r;
      } else {
        const q = Math.min(t.quantity, qty);
        if (q <= 0) continue;
        const unit = costBrl / qty;
        const cost = q * unit;
        sales.push({ date: d, ticker: a.ticker, category: cat, quantity: q, grossBrl: q * t.price * r, costBrl: cost, gainBrl: (q * t.price - fees) * r - cost });
        qty -= q;
        costBrl -= cost;
        if (qty <= 1e-12) { qty = 0; costBrl = 0; }
        if (txs.some((x) => x.type === "BUY" && day(x.date) === d)) dayTrades.add(a.ticker);
      }
    }
  }

  const holdings = (date: string): Holding[] => {
    const out: Holding[] = [];
    for (const { a, txs } of states) {
      let qty = 0, costBrl = 0, costNative = 0;
      for (const t of txs) {
        const d = day(t.date);
        if (d > date) break;
        const r = rate(a.currency, d);
        const fees = t.fees ?? 0;
        if (t.type === "BUY") { qty += t.quantity; costBrl += (t.quantity * t.price + fees) * r; costNative += t.quantity * t.price + fees; }
        else {
          const q = Math.min(t.quantity, qty);
          if (q <= 0) continue;
          const f = q / qty;
          costBrl -= costBrl * f; costNative -= costNative * f; qty -= q;
        }
      }
      if (qty > 1e-12) out.push({ ticker: a.ticker, assetClass: a.assetClass, category: categoryOf(a.assetClass, a.ticker), quantity: qty, costBrl, costNative, currency: a.currency });
    }
    return out.sort((x, y) => x.ticker.localeCompare(y.ticker));
  };
  return { sales: sales.sort((x, y) => x.date.localeCompare(y.date)), holdings, dayTrades: [...dayTrades] };
}

export function computeTax(assets: TaxAsset[], fx: Close[]): TaxResult & { holdingsAt: (date: string) => Holding[] } {
  const { sales, holdings, dayTrades } = replay(assets, fx);
  const warnings: string[] = [];

  // ---- monthly: ações (15%, isenção até R$ 20 mil), FII/ETF (20%), cripto (15%, isenção até R$ 35 mil)
  const months: MonthRow[] = [];
  for (const cat of ["ACAO", "FII", "CRIPTO"] as const) {
    const byMonth = new Map<string, { sales: number; gain: number }>();
    for (const s of sales.filter((x) => x.category === cat)) {
      const k = s.date.slice(0, 7);
      const m = byMonth.get(k) ?? { sales: 0, gain: 0 };
      m.sales += s.grossBrl;
      m.gain += s.gainBrl;
      byMonth.set(k, m);
    }
    let carry = 0;
    for (const [month, m] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const limit = cat === "ACAO" ? ACAO_EXEMPT_SALES : cat === "CRIPTO" ? CRIPTO_EXEMPT_SALES : 0;
      const exempt = m.gain > 0 && limit > 0 && m.sales <= limit;
      const carryIn = carry;
      let lossUsed = 0;
      let taxable = 0;
      if (m.gain < 0) {
        if (cat !== "CRIPTO") carry += -m.gain; // prejuízo em cripto não é compensado aqui (conservador)
      } else if (!exempt) {
        lossUsed = cat === "CRIPTO" ? 0 : Math.min(carry, m.gain);
        carry -= lossUsed;
        taxable = m.gain - lossUsed;
      }
      months.push({ month, category: cat, sales: m.sales, gain: m.gain, exempt, carryIn, lossUsed, carryOut: carry, taxable, tax: taxable * RATE[cat], due: darfDue(month) });
    }
  }
  months.sort((a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category));

  // ---- exterior: apuração anual, 15%, em reais
  const byYear = new Map<number, { gain: number; loss: number }>();
  for (const s of sales.filter((x) => x.category === "EXTERIOR")) {
    const y = Number(s.date.slice(0, 4));
    const r = byYear.get(y) ?? { gain: 0, loss: 0 };
    if (s.gainBrl >= 0) r.gain += s.gainBrl; else r.loss += -s.gainBrl;
    byYear.set(y, r);
  }
  const years: YearRow[] = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, r]) => {
    const net = r.gain - r.loss;
    return { year, gain: r.gain, loss: r.loss, net, tax: Math.max(0, net) * RATE.EXTERIOR };
  });

  const fiis = [...new Set(assets.filter((a) => categoryOf(a.assetClass, a.ticker) === "FII").map((a) => a.ticker))];
  if (fiis.length) warnings.push(`${fiis.join(", ")}: tickers terminados em 11 foram tratados como FII/ETF (20%, sem isenção). Se for unit de empresa, o tratamento correto é o de ações (15%, isenção até R$ 20 mil/mês).`);
  if (dayTrades.length) warnings.push(`${dayTrades.join(", ")}: houve compra e venda no mesmo dia. Day trade paga 20% sem isenção e não foi separado aqui.`);
  if (assets.some((a) => a.assetClass === "FX" && a.txs.length)) warnings.push("Moedas (USD, EUR…) não entram no cálculo.");
  return { months, years, sales, warnings, holdingsAt: holdings };
}
