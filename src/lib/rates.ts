import { db } from "./db";
import type { Close } from "./series";

const CDI_CODE = 12; // SGS 12: taxa DI diária, em % ao dia
const TTL_MS = 12 * 3600_000;

async function fetchBcb(code: number, from: string): Promise<Close[]> {
  const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${f(from)}&dataFinal=${f(today)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`BCB ${r.status}`);
  const rows = (await r.json()) as { data: string; valor: string }[];
  return rows
    .map((x) => ({ date: `${x.data.slice(6, 10)}-${x.data.slice(3, 5)}-${x.data.slice(0, 2)}`, close: Number(x.valor) }))
    .filter((x) => Number.isFinite(x.close));
}

/** CDI daily series from `from` to today. Cached in the database; if the BCB is down, the last copy is used (stale). */
export async function getCdiSeries(from: string): Promise<{ series: Close[] | null; stale: boolean }> {
  const cached = await db.rateCache.findUnique({ where: { code: CDI_CODE } });
  const covers = cached && cached.fromDate <= from;
  if (cached && covers && Date.now() - +cached.updatedAt < TTL_MS) return { series: JSON.parse(cached.data), stale: false };
  try {
    const start = cached && cached.fromDate < from ? cached.fromDate : from; // never shrink the stored range
    const series = await fetchBcb(CDI_CODE, start);
    if (series.length) {
      await db.rateCache.upsert({
        where: { code: CDI_CODE },
        create: { code: CDI_CODE, data: JSON.stringify(series), fromDate: start },
        update: { data: JSON.stringify(series), fromDate: start },
      });
    }
    return { series: series.length ? series : null, stale: false };
  } catch (e) {
    console.warn("[rates] CDI", (e as Error).message);
    return { series: cached ? JSON.parse(cached.data) : null, stale: !!cached };
  }
}
