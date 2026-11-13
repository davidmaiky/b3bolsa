/** FII indicators. P/L, Graham and Bazin do not apply to funds: P/VP, yield, payment regularity and vacancy do. */

export interface FiiInput {
  price?: number;
  vpa?: number; // valor patrimonial por cota
  dividends: { date: string; amount: number }[]; // per share, by ex-date (Yahoo)
  vacancyPhysical?: number | null; // % (manual)
  vacancyFinancial?: number | null; // % (manual)
  segment?: string | null;
  now?: Date;
}

export interface FiiSignal { label: string; ok: boolean | null }

export interface FiiMetrics {
  pvp?: number;
  discountPct?: number; // (P/VP − 1) × 100; negative = trades below book value
  lastDividend?: number;
  dyMonthlyLastPct?: number; // última distribuição ÷ preço
  dyMonthlyAvgPct?: number; // média mensal dos últimos 12 meses ÷ preço
  dy12mPct?: number;
  paymentMonths12: number; // meses distintos com pagamento nos últimos 12
  dividendTrendPct?: number; // média das 3 últimas vs 3 anteriores
  vacancyPhysical?: number;
  vacancyFinancial?: number;
  segment?: string;
  signals: FiiSignal[];
  score: number; // −100..100, referência por regras (limiares aproximados: ajuste ao cenário de juros)
}

const day = 86_400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);

export function fiiMetrics(i: FiiInput): FiiMetrics {
  const now = i.now ?? new Date();
  const divs = [...i.dividends].sort((a, b) => a.date.localeCompare(b.date));
  const last12 = divs.filter((d) => +now - Date.parse(d.date) <= 365 * day && Date.parse(d.date) <= +now);
  const sum12 = last12.reduce((s, d) => s + d.amount, 0);
  const months = new Set(last12.map((d) => d.date.slice(0, 7)));
  const price = i.price && i.price > 0 ? i.price : undefined;
  const pvp = price && i.vpa && i.vpa > 0 ? price / i.vpa : undefined;
  const last = divs.at(-1)?.amount;

  const recent = divs.slice(-3).map((d) => d.amount);
  const before = divs.slice(-6, -3).map((d) => d.amount);
  const trend = recent.length === 3 && before.length === 3 ? ((avg(recent)! / avg(before)!) - 1) * 100 : undefined;

  const vp = i.vacancyPhysical ?? undefined;
  const vf = i.vacancyFinancial ?? undefined;
  const dy12 = price && sum12 ? (sum12 / price) * 100 : undefined;

  const signals: FiiSignal[] = [
    { label: "P/VP ≤ 1,00 (negocia com desconto)", ok: pvp === undefined ? null : pvp <= 1 },
    { label: "Dividend yield 12m ≥ 8%", ok: dy12 === undefined ? null : dy12 >= 8 },
    { label: "Rendimento pago em 12 dos últimos 12 meses", ok: last12.length ? months.size >= 12 : null },
    { label: "Rendimentos estáveis ou crescentes", ok: trend === undefined ? null : trend >= -3 },
    { label: "Vacância física ≤ 10% (informada por você)", ok: vp === undefined ? null : vp <= 10 },
  ];

  let score = 0;
  if (pvp !== undefined) score += pvp <= 0.85 ? 30 : pvp <= 0.95 ? 20 : pvp <= 1.05 ? 5 : pvp <= 1.15 ? -15 : -30;
  if (dy12 !== undefined) score += dy12 >= 12 ? 25 : dy12 >= 9 ? 15 : dy12 >= 7 ? 5 : -10;
  if (last12.length) score += months.size >= 12 ? 10 : months.size >= 10 ? 0 : -15;
  if (trend !== undefined) score += trend >= 3 ? 10 : trend <= -5 ? -15 : 0;
  if (vp !== undefined) score += vp <= 5 ? 15 : vp <= 10 ? 5 : vp <= 20 ? -10 : -25;

  return {
    pvp,
    discountPct: pvp !== undefined ? (pvp - 1) * 100 : undefined,
    lastDividend: last,
    dyMonthlyLastPct: price && last ? (last / price) * 100 : undefined,
    dyMonthlyAvgPct: price && sum12 ? (sum12 / 12 / price) * 100 : undefined,
    dy12mPct: dy12,
    paymentMonths12: months.size,
    dividendTrendPct: trend,
    vacancyPhysical: vp,
    vacancyFinancial: vf,
    segment: i.segment ?? undefined,
    signals,
    score: Math.max(-100, Math.min(100, score)),
  };
}

export const FII_SEGMENTS = ["Logística", "Lajes corporativas", "Shoppings", "Papel (CRI)", "Fundo de fundos", "Híbrido", "Outros"] as const;
