import type { Close } from "./series";

/** Renda fixa de banco: o valor vem das condições do contrato, não de uma cotação. Estimativa para conferência com o extrato. */

export const KINDS = ["CDB", "LCI", "LCA", "CRI", "CRA", "DEBENTURE", "OUTRO"] as const;
export type Kind = (typeof KINDS)[number];
export const INDEXERS = ["PRE", "CDI_PCT", "CDI_PLUS"] as const;
export type Indexer = (typeof INDEXERS)[number];

export const KIND_LABEL: Record<Kind, string> = { CDB: "CDB", LCI: "LCI", LCA: "LCA", CRI: "CRI", CRA: "CRA", DEBENTURE: "Debênture", OUTRO: "Outro" };
export const INDEXER_LABEL: Record<Indexer, string> = { PRE: "Prefixado", CDI_PCT: "% do CDI", CDI_PLUS: "CDI + taxa" };
/** LCI, LCA, CRI e CRA são isentos de IR para pessoa física. */
export const IR_EXEMPT: Kind[] = ["LCI", "LCA", "CRI", "CRA"];
export const FGC_LIMIT = 250_000;

export const rateHint = (i: Indexer) =>
  i === "PRE" ? "% ao ano (ex.: 12,5)" : i === "CDI_PCT" ? "% do CDI (ex.: 110)" : "% ao ano somada ao CDI (ex.: 2,5)";

export function describeRate(i: Indexer, rate: number): string {
  const n = rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return i === "PRE" ? `${n}% a.a.` : i === "CDI_PCT" ? `${n}% do CDI` : `CDI + ${n}% a.a.`;
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

export interface Terms { kind: Kind; indexer: Indexer; rate: number; principal: number; startDate: string; maturityDate: string }

/**
 * Gross value (curve of the contract) at `asOf`, capped at maturity.
 * PRE: (1+r)^(du/252). CDI: product of the daily CDI (SGS 12, % per day) over the business days after the application;
 * days newer than the last published rate reuse it. Returns null when a CDI contract has no CDI data at all.
 */
export function grossValue(t: Terms, asOf: string, cdi: Close[] | null): number | null {
  const end = asOf < t.maturityDate ? asOf : t.maturityDate;
  if (end <= t.startDate) return t.principal;

  if (t.indexer === "PRE") return t.principal * Math.pow(1 + t.rate / 100, businessDaysBetween(t.startDate, end) / 252);

  if (!cdi?.length) return null;
  const series = [...cdi].sort((a, b) => a.date.localeCompare(b.date));
  const inRange = series.filter((r) => r.date > t.startDate && r.date <= end);
  const before = [...series].reverse().find((r) => r.date <= t.startDate);
  const lastRate = inRange.at(-1)?.close ?? before?.close ?? series.at(-1)!.close;
  const lastDate = inRange.at(-1)?.date ?? t.startDate;

  const daily = (cdiPct: number) =>
    t.indexer === "CDI_PCT" ? 1 + (cdiPct / 100) * (t.rate / 100) : (1 + cdiPct / 100) * Math.pow(1 + t.rate / 100, 1 / 252);
  let factor = 1;
  for (const r of inRange) factor *= daily(r.close);
  const extra = lastDate < end ? businessDaysBetween(lastDate, end) : 0;
  if (extra > 0) factor *= Math.pow(daily(lastRate), extra);
  return t.principal * factor;
}

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

export function valueOf(t: Terms, asOf: string, cdi: Close[] | null): FixedIncomeValue | null {
  const gross = grossValue(t, asOf, cdi);
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
