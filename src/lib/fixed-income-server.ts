import { db } from "./db";
import { getCdiSeries } from "./rates";
import { FGC_LIMIT, valueOf, type FixedIncomeValue, type Indexer, type Kind } from "./fixed-income";

const day = (d: Date) => d.toISOString().slice(0, 10);

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
  redeemedAt: string | null;
  redeemedNet: number | null;
  value: FixedIncomeValue | null; // null: contrato indexado ao CDI sem dados do CDI
}

export interface FixedIncomeSummary {
  count: number;
  principal: number;
  gross: number;
  net: number;
  cdiAvailable: boolean;
  cdiStale: boolean;
  fgcAlerts: { issuer: string; net: number }[]; // instituições acima do limite do FGC
}

export async function loadFixedIncome(asOf = day(new Date())): Promise<{ items: FixedIncomeRow[]; summary: FixedIncomeSummary }> {
  const rows = await db.fixedIncome.findMany({ orderBy: [{ redeemedAt: "asc" }, { maturityDate: "asc" }] });
  const needsCdi = rows.some((r) => r.indexer !== "PRE" && !r.redeemedAt);
  const first = rows.reduce((m, r) => (day(r.startDate) < m ? day(r.startDate) : m), asOf);
  const cdi = needsCdi ? await getCdiSeries(first) : { series: null, stale: false };

  const items: FixedIncomeRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as Kind,
    issuer: r.issuer,
    label: r.label,
    indexer: r.indexer as Indexer,
    rate: r.rate,
    principal: r.principal,
    startDate: day(r.startDate),
    maturityDate: day(r.maturityDate),
    liquidity: r.liquidity,
    fgc: r.fgc,
    note: r.note,
    redeemedAt: r.redeemedAt ? day(r.redeemedAt) : null,
    redeemedNet: r.redeemedNet,
    value: r.redeemedAt
      ? null
      : valueOf({ kind: r.kind as Kind, indexer: r.indexer as Indexer, rate: r.rate, principal: r.principal, startDate: day(r.startDate), maturityDate: day(r.maturityDate) }, asOf, cdi.series),
  }));

  const active = items.filter((i) => !i.redeemedAt);
  const byIssuer = new Map<string, number>();
  for (const i of active) if (i.fgc) byIssuer.set(i.issuer, (byIssuer.get(i.issuer) ?? 0) + (i.value?.net ?? i.principal));
  return {
    items,
    summary: {
      count: active.length,
      principal: active.reduce((s, i) => s + i.principal, 0),
      gross: active.reduce((s, i) => s + (i.value?.gross ?? i.principal), 0),
      net: active.reduce((s, i) => s + (i.value?.net ?? i.principal), 0),
      cdiAvailable: !needsCdi || !!cdi.series,
      cdiStale: cdi.stale,
      fgcAlerts: [...byIssuer.entries()].filter(([, v]) => v > FGC_LIMIT * 0.9).map(([issuer, net]) => ({ issuer, net })),
    },
  };
}
