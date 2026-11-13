import { getCdiSeries, getIpcaSeries } from "./rates";
import { FGC_LIMIT, KIND_LABEL, INDEXER_LABEL, describeRate, rowLabel } from "./fixed-income";
import { loadFixedIncome } from "./fixed-income-server";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Annualized CDI (252 business days) from the latest daily rate, in % a.a. */
export const cdiAnnualPct = (lastDailyPct: number) => (Math.pow(1 + lastDailyPct / 100, 252) - 1) * 100;
/** IPCA accumulated over the last 12 published months, in %. */
export const ipca12mPct = (monthly: number[]) => (monthly.slice(-12).reduce((f, v) => f * (1 + v / 100), 1) - 1) * 100;

/**
 * Fixed income facts for the Gemini prompt: holdings, maturities, FGC exposure per institution and today's CDI/IPCA so the
 * contract rates can be compared with the market. Returns null when there is no fixed income.
 */
export async function fixedIncomeForPrompt() {
  const { items, summary } = await loadFixedIncome();
  const open = items.filter((i) => !i.redeemedAt);
  if (!open.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [cdi, ipca] = await Promise.all([getCdiSeries(since).catch(() => null), getIpcaSeries(since).catch(() => null)]);
  const lastCdi = cdi?.series?.at(-1)?.close;
  const ipcaMonthly = ipca?.series?.map((r) => r.close) ?? [];

  const byIssuer = new Map<string, number>();
  for (const i of open) if (i.fgc) byIssuer.set(i.issuer, (byIssuer.get(i.issuer) ?? 0) + (i.value?.net ?? i.principal));

  return {
    data: today,
    total_liquido_brl: round2(summary.net),
    total_aplicado_brl: round2(summary.principal),
    cdi_atual_aa_pct: lastCdi !== undefined ? round2(cdiAnnualPct(lastCdi)) : null,
    ipca_12m_pct: ipcaMonthly.length >= 12 ? round2(ipca12mPct(ipcaMonthly)) : null,
    itens: open.map((i) => ({
      nome: rowLabel(i),
      tipo: KIND_LABEL[i.kind],
      emissor: i.issuer,
      indexador: INDEXER_LABEL[i.indexer],
      taxa_contratada: i.indexer === "TESOURO" ? (i.tdTitle ?? "Tesouro") : describeRate(i.indexer, i.rate),
      vencimento: i.maturityDate,
      dias_para_vencer: i.value?.daysToMaturity ?? null,
      liquidez: i.liquidity === "DAILY" ? "diária" : "no vencimento",
      fgc: i.fgc,
      aplicado_brl: round2(i.principal),
      valor_liquido_brl: round2(i.value?.net ?? i.principal),
      rendimento_liquido_pct: i.value ? round2(i.value.netYieldPct) : null,
    })),
    exposicao_por_emissor_fgc: [...byIssuer.entries()].map(([emissor, valor]) => ({ emissor, valor_brl: round2(valor), pct_do_limite_fgc: round2((valor / FGC_LIMIT) * 100) })),
  };
}
