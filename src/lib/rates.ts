import { db } from "./db";
import type { Close } from "./series";

const CDI_CODE = 12; // SGS 12: taxa DI diária, em % ao dia
const IPCA_CODE = 433; // SGS 433: IPCA, variação mensal em %
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

/** A BCB series from `from` to today, cached in the database; if the BCB is down, the last copy is used (stale). */
async function bcbSeries(code: number, from: string): Promise<{ series: Close[] | null; stale: boolean }> {
  const cached = await db.rateCache.findUnique({ where: { code } });
  const covers = cached && cached.fromDate <= from;
  if (cached && covers && Date.now() - +cached.updatedAt < TTL_MS) return { series: JSON.parse(cached.data), stale: false };
  try {
    const start = cached && cached.fromDate < from ? cached.fromDate : from; // never shrink the stored range
    const series = await fetchBcb(code, start);
    if (series.length) {
      await db.rateCache.upsert({
        where: { code },
        create: { code, data: JSON.stringify(series), fromDate: start },
        update: { data: JSON.stringify(series), fromDate: start },
      });
    }
    return { series: series.length ? series : null, stale: false };
  } catch (e) {
    console.warn("[rates] BCB", code, (e as Error).message);
    return { series: cached ? JSON.parse(cached.data) : null, stale: !!cached };
  }
}

export const getCdiSeries = (from: string) => bcbSeries(CDI_CODE, from);
/** IPCA is monthly (dated the 1st): ask from the first day of the starting month. */
export const getIpcaSeries = (from: string) => bcbSeries(IPCA_CODE, `${from.slice(0, 7)}-01`);

// ---------------- Tesouro Direto (Tesouro Transparente) ----------------

const TESOURO_CSV = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv";
const TESOURO_TTL_MS = 6 * 3600_000;
const brDate = (s: string) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
const brNum = (s: string) => Number(s.replace(",", "."));

export interface TesouroRow { title: string; maturity: string; date: string; rateSell: number; puSell: number }

/** Parses one CSV line: Tipo;Vencimento;Data Base;Taxa Compra;Taxa Venda;PU Compra;PU Venda;PU Base. */
export function parseTesouroLine(line: string): TesouroRow | null {
  const c = line.trim().split(";");
  if (c.length < 8 || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[1]) || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[2])) return null;
  const puSell = brNum(c[6]);
  if (!Number.isFinite(puSell) || puSell <= 0) return null;
  return { title: c[0], maturity: brDate(c[1]), date: brDate(c[2]), rateSell: brNum(c[4]), puSell };
}

/**
 * Streams the CSV (newest base date first) and hands each row to `onRow`; stops as soon as `onRow` returns false
 * or the rows get older than `stopBefore`, so only the recent part of the file is ever downloaded.
 */
async function streamTesouro(stopBefore: string, onRow: (r: TesouroRow) => boolean | void): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const res = await fetch(TESOURO_CSV, { signal: ctl.signal });
    if (!res.ok || !res.body) throw new Error(`Tesouro ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder("utf-8");
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buf.split("\n");
      buf = done ? "" : (lines.pop() ?? "");
      for (const line of done ? lines.concat(buf) : lines) {
        const row = parseTesouroLine(line);
        if (!row) continue;
        if (row.date < stopBefore || onRow(row) === false) {
          ctl.abort();
          return;
        }
      }
      if (done) return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError" && ctl.signal.aborted) return; // we stopped it on purpose (or the 60 s guard)
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const g = globalThis as unknown as { __tdTitles?: { at: number; rows: TesouroRow[] } };

/** Titles on sale today (latest base date) with their sell price and rate. Cached in memory for a few hours. */
export async function getTesouroTitles(): Promise<TesouroRow[]> {
  if (g.__tdTitles && Date.now() - g.__tdTitles.at < TESOURO_TTL_MS) return g.__tdTitles.rows;
  const rows: TesouroRow[] = [];
  let latest = "";
  await streamTesouro("0000-00-00", (r) => {
    if (!latest) latest = r.date;
    if (r.date !== latest) return false;
    rows.push(r);
  });
  if (rows.length) g.__tdTitles = { at: Date.now(), rows };
  return rows;
}

export const tesouroKeyOf = (title: string, maturity: string) => `${title}|${maturity}`;

/**
 * Daily PU de venda of the given titles ("Título|vencimento") from `from` to today. Stored in the database;
 * re-read when stale, when it does not reach back to `from` or when a title is missing. Falls back to the stored copy.
 */
export async function getTesouroSeries(keys: string[], from: string): Promise<{ series: Map<string, Close[]>; stale: boolean }> {
  const cached = await db.tesouroCache.findUnique({ where: { id: "all" } });
  const stored: Record<string, Close[]> = cached ? JSON.parse(cached.data) : {};
  const complete = cached && cached.fromDate <= from && keys.every((k) => k in stored);
  if (complete && Date.now() - +cached.updatedAt < TESOURO_TTL_MS) return { series: new Map(Object.entries(stored)), stale: false };

  const want = new Set([...keys, ...Object.keys(stored)]);
  const start = cached && cached.fromDate < from ? cached.fromDate : from;
  try {
    const fresh: Record<string, Close[]> = {};
    await streamTesouro(start, (r) => {
      const k = tesouroKeyOf(r.title, r.maturity);
      if (want.has(k)) (fresh[k] ??= []).push({ date: r.date, close: r.puSell });
    });
    for (const k of Object.keys(fresh)) fresh[k].reverse(); // the file is newest first
    if (Object.keys(fresh).length) {
      await db.tesouroCache.upsert({
        where: { id: "all" },
        create: { id: "all", data: JSON.stringify(fresh), fromDate: start },
        update: { data: JSON.stringify(fresh), fromDate: start },
      });
    }
    return { series: new Map(Object.entries(Object.keys(fresh).length ? fresh : stored)), stale: false };
  } catch (e) {
    console.warn("[rates] Tesouro", (e as Error).message);
    return { series: new Map(Object.entries(stored)), stale: !!cached };
  }
}
