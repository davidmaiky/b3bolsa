import { db } from "./db";
import { getCdiSeries, getIpcaSeries, getTesouroSeries, tesouroKeyOf } from "./rates";
import { FGC_LIMIT, valueOf, type FixedIncomeValue, type Indexer, type Kind, type Rates, type Terms } from "./fixed-income";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Notice window before maturity (FI_DUE_DAYS, default 7). */
export const dueDays = () => Math.max(1, Number(process.env.FI_DUE_DAYS) || 7);

export interface FixedIncomeRow {
  id: string;
  kind: Kind;
  issuer: string;
  label: string | null;
  indexer: Indexer;
  rate: number;
  principal: number;
  startDate: string;
  maturityDate: string;
  liquidity: string;
  fgc: boolean;
  note: string | null;
  tdTitle: string | null;
  quantity: number | null;
  redeemedAt: string | null;
  redeemedNet: number | null;
  dueSeenAt: string | null;
  value: FixedIncomeValue | null; // null: falta o dado de mercado do contrato (CDI, IPCA ou preço do Tesouro)
}

export interface FixedIncomeSummary {
  count: number;
  principal: number;
  gross: number;
  net: number;
  missing: string[]; // dados de mercado que faltam (ex.: "CDI")
  stale: boolean; // usando a última cópia guardada, a fonte não respondeu
  fgcAlerts: { issuer: string; net: number }[]; // instituições acima de 90% do limite do FGC
}

export interface RateNeeds { indexer: string; startDate: string; maturityDate: string; tdTitle: string | null }

/** Loads (from cache or the sources) only the market data the given contracts depend on. */
export async function loadRates(rows: RateNeeds[]): Promise<{ rates: Rates; stale: boolean; missing: string[] }> {
  const minStart = (xs: RateNeeds[]) => xs.reduce((m, r) => (r.startDate < m ? r.startDate : m), "9999-12-31");
  const cdiRows = rows.filter((r) => r.indexer === "CDI_PCT" || r.indexer === "CDI_PLUS");
  const ipcaRows = rows.filter((r) => r.indexer === "IPCA_PLUS");
  const tdRows = rows.filter((r) => r.indexer === "TESOURO" && r.tdTitle);

  const [cdi, ipca, td] = await Promise.all([
    cdiRows.length ? getCdiSeries(minStart(cdiRows)) : null,
    ipcaRows.length ? getIpcaSeries(minStart(ipcaRows)) : null,
    tdRows.length ? getTesouroSeries([...new Set(tdRows.map((r) => tesouroKeyOf(r.tdTitle!, r.maturityDate)))], minStart(tdRows)) : null,
  ]);
  const missing: string[] = [];
  if (cdi && !cdi.series) missing.push("CDI");
  if (ipca && !ipca.series) missing.push("IPCA");
  if (td && ![...td.series.values()].some((s) => s.length)) missing.push("preços do Tesouro");
  return {
    rates: { cdi: cdi?.series ?? null, ipca: ipca?.series ?? null, tesouro: td?.series ?? null },
    stale: !!(cdi?.stale || ipca?.stale || td?.stale),
    missing,
  };
}

export const termsOf = (r: { kind: string; indexer: string; rate: number; principal: number; startDate: Date; maturityDate: Date; quantity: number | null; tdTitle: string | null }): Terms => ({
  kind: r.kind as Kind, indexer: r.indexer as Indexer, rate: r.rate, principal: r.principal,
  startDate: day(r.startDate), maturityDate: day(r.maturityDate), quantity: r.quantity, tdTitle: r.tdTitle,
});

export async function loadFixedIncome(asOf = day(new Date())): Promise<{ items: FixedIncomeRow[]; summary: FixedIncomeSummary }> {
  const rows = await db.fixedIncome.findMany({ orderBy: [{ redeemedAt: "asc" }, { maturityDate: "asc" }] });
  const active = rows.filter((r) => !r.redeemedAt);
  const { rates, stale, missing } = await loadRates(active.map((r) => ({ indexer: r.indexer, startDate: day(r.startDate), maturityDate: day(r.maturityDate), tdTitle: r.tdTitle })));

  const items: FixedIncomeRow[] = rows.map((r) => ({
    id: r.id, kind: r.kind as Kind, issuer: r.issuer, label: r.label, indexer: r.indexer as Indexer, rate: r.rate, principal: r.principal,
    startDate: day(r.startDate), maturityDate: day(r.maturityDate), liquidity: r.liquidity, fgc: r.fgc, note: r.note,
    tdTitle: r.tdTitle, quantity: r.quantity,
    redeemedAt: r.redeemedAt ? day(r.redeemedAt) : null, redeemedNet: r.redeemedNet, dueSeenAt: r.dueSeenAt ? day(r.dueSeenAt) : null,
    value: r.redeemedAt ? null : valueOf(termsOf(r), asOf, rates),
  }));

  const open = items.filter((i) => !i.redeemedAt);
  const byIssuer = new Map<string, number>();
  for (const i of open) if (i.fgc) byIssuer.set(i.issuer, (byIssuer.get(i.issuer) ?? 0) + (i.value?.net ?? i.principal));
  return {
    items,
    summary: {
      count: open.length,
      principal: open.reduce((s, i) => s + i.principal, 0),
      gross: open.reduce((s, i) => s + (i.value?.gross ?? i.principal), 0),
      net: open.reduce((s, i) => s + (i.value?.net ?? i.principal), 0),
      missing,
      stale,
      fgcAlerts: [...byIssuer.entries()].filter(([, v]) => v > FGC_LIMIT * 0.9).map(([issuer, net]) => ({ issuer, net })),
    },
  };
}
