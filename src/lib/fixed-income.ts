import type { Close } from "./series";

/** Renda fixa de banco: o valor vem das condições do contrato, não de uma cotação. Estimativa para conferência com o extrato. */

export const KINDS = ["CDB", "LCI", "LCA", "CRI", "CRA", "DEBENTURE", "TESOURO", "OUTRO"] as const;
export type Kind = (typeof KINDS)[number];
export const INDEXERS = ["PRE", "CDI_PCT", "CDI_PLUS", "IPCA_PLUS", "TESOURO"] as const;
export type Indexer = (typeof INDEXERS)[number];

export const KIND_LABEL: Record<Kind, string> = { CDB: "CDB", LCI: "LCI", LCA: "LCA", CRI: "CRI", CRA: "CRA", DEBENTURE: "Debênture", TESOURO: "Tesouro Direto", OUTRO: "Outro" };
export const INDEXER_LABEL: Record<Indexer, string> = { PRE: "Prefixado", CDI_PCT: "% do CDI", CDI_PLUS: "CDI + taxa", IPCA_PLUS: "IPCA + taxa", TESOURO: "Tesouro (preço de mercado)" };
/** LCI, LCA, CRI e CRA são isentos de IR para pessoa física. */
export const IR_EXEMPT: Kind[] = ["LCI", "LCA", "CRI", "CRA"];
export const FGC_LIMIT = 250_000;

export const rateHint = (i: Indexer) =>
  i === "PRE" ? "% ao ano (ex.: 12,5)" : i === "CDI_PCT" ? "% do CDI (ex.: 110)" : i === "CDI_PLUS" ? "% ao ano somada ao CDI (ex.: 2,5)" : i === "IPCA_PLUS" ? "% ao ano somada ao IPCA (ex.: 6,2)" : "não se aplica";

export function describeRate(i: Indexer, rate: number): string {
  const n = rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return i === "PRE" ? `${n}% a.a.` : i === "CDI_PCT" ? `${n}% do CDI` : i === "CDI_PLUS" ? `CDI + ${n}% a.a.` : i === "IPCA_PLUS" ? `IPCA + ${n}% a.a.` : "preço de mercado";
}

// ---------------- calendário (feriados nacionais ANBIMA) ----------------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<string>>();
function holidays(year: number): Set<string> {
  let s = holidayCache.get(year);
  if (!s) {
    const e = easter(year);
    s = new Set([
      `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`, `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-12-25`,
      ...(year >= 2024 ? [`${year}-11-20`] : []), // Consciência Negra, nacional desde 2024
      iso(addDays(e, -48)), iso(addDays(e, -47)), iso(addDays(e, -2)), iso(addDays(e, 60)), // Carnaval, Sexta-feira Santa, Corpus Christi
    ]);
    holidayCache.set(year, s);
  }
  return s;
}

export function isBusinessDay(date: string): boolean {
  const dow = utc(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays(Number(date.slice(0, 4))).has(date);
}

/** Business days in (from, to]: the day of the application does not accrue, the day of the redemption does. */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = addDays(utc(from), 1); d <= utc(to); d = addDays(d, 1)) if (isBusinessDay(iso(d))) n++;
  return n;
}

export const calendarDays = (from: string, to: string) => Math.round((+utc(to) - +utc(from)) / 86_400_000);

// ---------------- rendimento ----------------

export interface Terms {
  kind: Kind;
  indexer: Indexer;
  rate: number;
  principal: number;
  startDate: string;
  maturityDate: string;
  quantity?: number | null; // Tesouro Direto
  tdTitle?: string | null; // Tesouro Direto
}

/** Market data the contracts depend on. Each field is optional: a contract without its data cannot be valued (null). */
export interface Rates {
  cdi?: Close[] | null; // SGS 12, % ao dia
  ipca?: Close[] | null; // SGS 433, % ao mês (data = dia 1 do mês)
  tesouro?: Map<string, Close[]> | null; // "Título|vencimento" -> PU de venda por dia
}

export const tesouroKey = (title: string, maturity: string) => `${title}|${maturity}`;

const bsearch = (dates: string[], d: string): number => {
  // number of entries with date <= d
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= d) lo = mid + 1; else hi = mid;
  }
  return lo;
};

const monthBd = new Map<string, number>();
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); // last day of the month
};
const bdInMonth = (m: string) => {
  let n = monthBd.get(m);
  if (n === undefined) {
    n = businessDaysBetween(`${m}-01`, monthEnd(m)) + (isBusinessDay(`${m}-01`) ? 1 : 0);
    monthBd.set(m, n);
  }
  return n;
};

/**
 * IPCA accumulated between (from, to]: each month's IPCA is spread over that month's business days (the NTN-B convention),
 * so partial months count pro rata. Months not yet published reuse the last published IPCA (an estimate).
 */
export function ipcaFactor(from: string, to: string, ipca: Close[]): number {
  const byMonth = new Map(ipca.map((r) => [r.date.slice(0, 7), r.close]));
  const sorted = [...ipca].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1)?.close ?? 0;
  let factor = 1;
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) {
    const lo = m === from.slice(0, 7) ? from : addDay(`${m}-01`, -1); // (lo, hi]
    const hi = m === to.slice(0, 7) ? to : monthEnd(m);
    const inRange = businessDaysBetween(lo, hi);
    if (inRange === 0) continue;
    factor *= Math.pow(1 + (byMonth.get(m) ?? last) / 100, inRange / bdInMonth(m));
  }
  return factor;
}
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const addDay = (d: string, n: number) => new Date(+utc(d) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Builds the valuation curve of one contract; the returned function gives the gross value at any date (null = missing data).
 * PRE: (1+r)^(du/252). CDI: product of the daily CDI (prefix products, so each date is O(log n)); days newer than the last
 * published rate reuse it. IPCA+: IPCA factor × (1+r)^(du/252). Tesouro: quantity × PU de venda on the date (last price on or before it).
 * Everything is capped at maturity.
 */
export function makeAccrual(t: Terms, rates: Rates): (asOf: string) => number | null {
  const cap = (asOf: string) => (asOf < t.maturityDate ? asOf : t.maturityDate);

  if (t.indexer === "PRE") {
    return (asOf) => {
      const end = cap(asOf);
      return end <= t.startDate ? t.principal : t.principal * Math.pow(1 + t.rate / 100, businessDaysBetween(t.startDate, end) / 252);
    };
  }

  if (t.indexer === "TESOURO") {
    const series = t.tdTitle ? rates.tesouro?.get(tesouroKey(t.tdTitle, t.maturityDate)) : undefined;
    if (!series?.length || !t.quantity) return () => null;
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((r) => r.date);
    return (asOf) => {
      const end = cap(asOf);
      if (end <= t.startDate) return t.principal;
      const n = bsearch(dates, end);
      return n ? t.quantity! * sorted[n - 1].close : t.principal;
    };
  }

  if (t.indexer === "IPCA_PLUS") {
    const ipca = rates.ipca;
    if (!ipca?.length) return () => null;
    return (asOf) => {
      const end = cap(asOf);
      if (end <= t.startDate) return t.principal;
      return t.principal * ipcaFactor(t.startDate, end, ipca) * Math.pow(1 + t.rate / 100, businessDaysBetween(t.startDate, end) / 252);
    };
  }

  // CDI_PCT and CDI_PLUS
  const cdi = rates.cdi;
  if (!cdi?.length) return () => null;
  const series = [...cdi].sort((a, b) => a.date.localeCompare(b.date));
  const dates = series.map((r) => r.date);
  const daily = (c: number) => (t.indexer === "CDI_PCT" ? 1 + (c / 100) * (t.rate / 100) : (1 + c / 100) * Math.pow(1 + t.rate / 100, 1 / 252));
  const prefix = [1];
  for (const r of series) prefix.push(prefix[prefix.length - 1] * daily(r.close));

  return (asOf) => {
    const end = cap(asOf);
    if (end <= t.startDate) return t.principal;
    const lo = bsearch(dates, t.startDate);
    const hi = bsearch(dates, end);
    let factor = prefix[hi] / prefix[lo];
    const lastDate = hi > lo ? dates[hi - 1] : t.startDate;
    const lastRate = hi > lo ? series[hi - 1].close : lo > 0 ? series[lo - 1].close : series[series.length - 1].close;
    const extra = lastDate < end ? businessDaysBetween(lastDate, end) : 0;
    if (extra > 0) factor *= Math.pow(daily(lastRate), extra);
    return t.principal * factor;
  };
}

/** Gross value (curve of the contract) at `asOf`; null when the data the contract depends on is missing. */
export const grossValue = (t: Terms, asOf: string, rates: Rates): number | null => makeAccrual(t, rates)(asOf);

// ---------------- impostos ----------------

/** IOF over the yield for redemptions in the first 30 days (day 1 = 96% … day 30 = 0). */
const IOF_TABLE = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];
export const iofRate = (days: number) => (days < 1 ? 1 : days >= 30 ? 0 : IOF_TABLE[days - 1] / 100);

/** Tabela regressiva do IR sobre renda fixa. */
export const irRate = (days: number) => (days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15);

export interface Net { gross: number; yieldGross: number; iof: number; ir: number; irRate: number; net: number }

/** Net value if redeemed at `asOf` (never later than maturity). */
export function netValue(kind: Kind, principal: number, gross: number, startDate: string, asOf: string, maturityDate: string): Net {
  const end = asOf < maturityDate ? asOf : maturityDate;
  const days = calendarDays(startDate, end);
  const yieldGross = Math.max(0, gross - principal);
  const exempt = IR_EXEMPT.includes(kind);
  const iof = exempt ? 0 : yieldGross * iofRate(days);
  const rate = exempt ? 0 : irRate(days);
  const ir = (yieldGross - iof) * rate;
  return { gross, yieldGross, iof, ir, irRate: rate, net: gross - iof - ir };
}

export interface FixedIncomeValue extends Net {
  principal: number;
  daysHeld: number;
  daysToMaturity: number;
  matured: boolean;
  netYieldPct: number; // rendimento líquido acumulado sobre o aplicado
}

export function valueOf(t: Terms, asOf: string, rates: Rates): FixedIncomeValue | null {
  return valueFrom(t, asOf, makeAccrual(t, rates));
}

/** Same as valueOf with a prebuilt curve (use it when valuing many dates of one contract). */
export function valueFrom(t: Terms, asOf: string, accrual: (asOf: string) => number | null): FixedIncomeValue | null {
  const gross = accrual(asOf);
  if (gross === null) return null;
  const n = netValue(t.kind, t.principal, gross, t.startDate, asOf, t.maturityDate);
  return {
    ...n,
    principal: t.principal,
    daysHeld: Math.max(0, calendarDays(t.startDate, asOf)),
    daysToMaturity: calendarDays(asOf, t.maturityDate),
    matured: asOf >= t.maturityDate,
    netYieldPct: t.principal ? ((n.net - t.principal) / t.principal) * 100 : 0,
  };
}

/** Display name: the nickname, else the Tesouro title, else "CDB Banco X". */
export const rowLabel = (r: { label?: string | null; kind: string; issuer: string; tdTitle?: string | null }) =>
  r.label || (r.kind === "TESOURO" && r.tdTitle ? r.tdTitle : `${KIND_LABEL[r.kind as Kind] ?? r.kind} ${r.issuer}`);
