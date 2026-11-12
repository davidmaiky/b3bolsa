import type { Fundamentals } from "./yahoo";

/** Valor intrínseco de Graham: √(22,5 × LPA × VPA). */
export function grahamValue(eps?: number, bvps?: number): number | undefined {
  if (!eps || !bvps || eps <= 0 || bvps <= 0) return undefined;
  return Math.sqrt(22.5 * eps * bvps);
}

/** Preço teto de Bazin: dividendos dos últimos 12 meses ÷ yield mínimo (6%). */
export function bazinCeiling(dividendPerShare?: number, minYield = 0.06): number | undefined {
  if (!dividendPerShare || dividendPerShare <= 0) return undefined;
  return dividendPerShare / minYield;
}

/** (justo − preço) ÷ justo. Positivo = desconto. */
export function marginOfSafety(fair?: number, price?: number): number | undefined {
  if (!fair || !price) return undefined;
  return (fair - price) / fair;
}

export interface Momentum {
  return30d?: number;
  return90d?: number;
  return365d?: number;
  volatilityAnnual?: number;
  sma50?: number;
  sma200?: number;
  distSma200?: number;
  rsi14?: number;
}

const sma = (xs: number[], n: number) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : undefined);

export function rsi(closes: number[], period = 14): number | undefined {
  if (closes.length <= period) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** closes: daily closes, oldest first. tradingDaysYear: 252 stocks, 365 crypto. */
export function momentum(closes: number[], tradingDaysYear = 252): Momentum {
  if (closes.length < 2) return {};
  const last = closes.at(-1)!;
  const ret = (n: number) => (closes.length > n ? last / closes[closes.length - 1 - n] - 1 : undefined);
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const recent = rets.slice(-90);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, recent.length - 1);
  const s200 = sma(closes, 200);
  const perMonth = Math.round(tradingDaysYear / 12);
  return {
    return30d: ret(perMonth),
    return90d: ret(perMonth * 3),
    return365d: ret(tradingDaysYear),
    volatilityAnnual: Math.sqrt(variance) * Math.sqrt(tradingDaysYear),
    sma50: sma(closes, 50),
    sma200: s200,
    distSma200: s200 ? last / s200 - 1 : undefined,
    rsi14: rsi(closes),
  };
}

export interface ValuationSignals {
  price?: number;
  grahamValue?: number;
  grahamMargin?: number;
  bazinCeiling?: number;
  bazinMargin?: number;
  pe?: number;
  pb?: number;
  peTimesPb?: number;
  grahamCriteria: { label: string; ok: boolean | null }[];
  score: number; // -100..100 rule-based baseline
}

/** Rule-based reading of the fundamentals; also the baseline the LLM sees. */
export function valuation(f: Fundamentals, price = f.price): ValuationSignals {
  const g = grahamValue(f.eps, f.bookValuePerShare);
  const b = bazinCeiling(f.dividendRate);
  const pe = f.pe;
  const pb = f.pb;
  const peTimesPb = pe && pb ? pe * pb : undefined;
  const crit = (label: string, ok: boolean | null) => ({ label, ok });
  const criteria = [
    crit("P/L ≤ 15", pe === undefined ? null : pe > 0 && pe <= 15),
    crit("P/VP ≤ 1,5", pb === undefined ? null : pb <= 1.5),
    crit("P/L × P/VP ≤ 22,5", peTimesPb === undefined ? null : pe! > 0 && peTimesPb <= 22.5),
    crit("LPA positivo", f.eps === undefined ? null : f.eps > 0),
    crit("Liquidez corrente ≥ 1,5", f.currentRatio === undefined ? null : f.currentRatio >= 1.5),
    crit("Paga dividendos", f.dividendRate === undefined ? null : f.dividendRate > 0),
    crit("ROE ≥ 15%", f.roe === undefined ? null : f.roe >= 0.15),
    crit("Dívida/PL ≤ 100%", f.debtToEquity === undefined ? null : f.debtToEquity <= 100),
  ];

  let score = 0;
  const gm = marginOfSafety(g, price);
  const bm = marginOfSafety(b, price);
  if (gm !== undefined) score += clamp(gm * 100, -40, 40);
  if (bm !== undefined) score += clamp(bm * 50, -20, 20);
  for (const c of criteria) if (c.ok !== null) score += c.ok ? 5 : -5;
  if (pe !== undefined && pe <= 0) score -= 15;

  return {
    price,
    grahamValue: g,
    grahamMargin: gm,
    bazinCeiling: b,
    bazinMargin: bm,
    pe,
    pb,
    peTimesPb,
    grahamCriteria: criteria,
    score: Math.round(clamp(score, -100, 100)),
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
