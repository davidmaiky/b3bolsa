import { db } from "./db";
import { yahooHistory } from "./yahoo";
import { yahooSymbol } from "./lse/symbols";
import { netOf } from "./dividends";
import type { AssetClass, AssetRef } from "./types";
import { forwardFill, type Close } from "./series";

export { forwardFill, type Close };

interface EvTx { type: string; quantity: number; price: number; fees?: number; date: Date | string }
export interface EvAsset { ref: AssetRef; txs: EvTx[]; closes: Close[]; divs: { date: Date | string; net: number }[] }

export interface EvPoint {
  date: string;
  holdings: number; // patrimônio em ativos (R$)
  invested: number; // aportes líquidos acumulados (compras − vendas, R$)
  dividends: number; // proventos líquidos acumulados (R$)
  twr: number; // índice base 100, só preço
  twrTotal: number; // índice base 100, com proventos
  cdi?: number;
  ibov?: number;
  sp500?: number; // em R$
}
export interface Evolution { points: EvPoint[]; missing: string[]; warnings: string[]; generatedAt: string }

const dayStr = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/** Calendar days start..end inclusive (UTC, YYYY-MM-DD). */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Cumulative index (base 100 on the first date) from a daily-rate series in percent (CDI). */
export function cumulativeFromRates(rates: Close[], dates: string[]): (number | null)[] {
  const s = [...rates].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  let idx = 100;
  return dates.map((d, n) => {
    if (n > 0) while (i < s.length && s[i].date <= d) { if (s[i].date > dates[0]) idx *= 1 + s[i].close / 100; i++; }
    else while (i < s.length && s[i].date <= d) i++;
    return idx;
  });
}

const rebase = (v: (number | null)[]): (number | null)[] => {
  const base = v.find((x) => x !== null && x > 0) ?? null;
  return v.map((x) => (x === null || base === null ? null : (x / base) * 100));
};

/**
 * Daily reconstruction of the portfolio from transactions and historical closes.
 * Time-weighted return: r_t = (V_t − F_t) / V_{t−1} − 1, with F_t the net cash put in on day t
 * (valued at the day's transaction prices), so deposits do not count as performance.
 */
export function computeEvolution(opts: {
  assets: EvAsset[];
  fx: Close[]; // USD→BRL
  end: string;
  cdiRates?: Close[];
  ibov?: Close[];
  sp500Usd?: Close[];
}): Evolution {
  const { assets, fx, end } = opts;
  const warnings: string[] = [];
  const missing: string[] = [];
  const allTxs = assets.flatMap((a) => a.txs);
  if (!allTxs.length) return { points: [], missing, warnings: ["Sem transações para reconstruir a evolução."], generatedAt: new Date().toISOString() };
  const start = dayStr(allTxs.reduce((m, t) => (new Date(t.date) < new Date(m) ? t.date : m), allTxs[0].date));
  const dates = dateRange(start, end);
  const fxFill = forwardFill(fx, dates);
  if (assets.some((a) => a.ref.currency === "USD") && fxFill.every((x) => x === null)) {
    throw new Error("Cotação histórica do dólar indisponível no momento.");
  }
  const rate = (cur: string, n: number) => (cur === "USD" ? fxFill[n] ?? fxFill.find((x) => x !== null) ?? 1 : 1);

  const n = dates.length;
  const holdings = new Array<number>(n).fill(0);
  const flow = new Array<number>(n).fill(0);
  const divCum = new Array<number>(n).fill(0);

  for (const a of assets) {
    const px = forwardFill(a.closes, dates);
    if (!a.closes.length) missing.push(a.ref.ticker);
    const txs = [...a.txs].sort((x, y) => +new Date(x.date) - +new Date(y.date));
    const divByDay = new Map<string, number>();
    for (const d of a.divs) divByDay.set(dayStr(d.date), (divByDay.get(dayStr(d.date)) ?? 0) + d.net);
    let qty = 0;
    let lastTxPrice: number | null = null;
    let ti = 0;
    let cumDiv = 0;
    for (let k = 0; k < n; k++) {
      let flowNative = 0;
      while (ti < txs.length && dayStr(txs[ti].date) <= dates[k]) {
        const t = txs[ti++];
        const fees = t.fees ?? 0;
        if (t.type === "BUY") { qty += t.quantity; flowNative += t.quantity * t.price + fees; }
        else { const q = Math.min(t.quantity, qty); qty -= q; flowNative -= q * t.price - fees; }
        lastTxPrice = t.price;
      }
      cumDiv += divByDay.get(dates[k]) ?? 0;
      const r = rate(a.ref.currency, k);
      const price = px[k] ?? lastTxPrice;
      if (qty > 1e-12 && price !== null) holdings[k] += qty * price * r;
      flow[k] += flowNative * r;
      divCum[k] += cumDiv * r;
    }
  }

  let invested = 0;
  const twr: number[] = [];
  const twrTotal: number[] = [];
  const points: EvPoint[] = [];
  const ibov = rebase(forwardFill(opts.ibov ?? [], dates));
  const cdi = opts.cdiRates?.length ? cumulativeFromRates(opts.cdiRates, dates) : null;
  const spBrl = opts.sp500Usd?.length
    ? rebase(forwardFill(opts.sp500Usd, dates).map((v, k) => (v === null || fxFill[k] === null ? null : v * (fxFill[k] as number))))
    : null;

  for (let k = 0; k < n; k++) {
    invested += flow[k];
    const v = holdings[k];
    const vt = holdings[k] + divCum[k];
    const prevV = k ? holdings[k - 1] : 0;
    const prevVt = k ? holdings[k - 1] + divCum[k - 1] : 0;
    // first deposit (nothing held yet): performance is measured against the money put in that day
    const rp = prevV > 0 ? (v - flow[k]) / prevV - 1 : flow[k] > 0 ? v / flow[k] - 1 : 0;
    const rt = prevVt > 0 ? (vt - flow[k]) / prevVt - 1 : flow[k] > 0 ? vt / flow[k] - 1 : 0;
    twr.push((k ? twr[k - 1] : 100) * (1 + rp));
    twrTotal.push((k ? twrTotal[k - 1] : 100) * (1 + rt));
    points.push({
      date: dates[k],
      holdings: v,
      invested,
      dividends: divCum[k],
      twr: twr[k],
      twrTotal: twrTotal[k],
      cdi: cdi?.[k] ?? undefined,
      ibov: ibov[k] ?? undefined,
      sp500: spBrl?.[k] ?? undefined,
    });
  }
  if (missing.length) warnings.push(`Sem histórico de preços para ${missing.join(", ")}: usei o preço das suas operações.`);
  if (!opts.ibov?.length) warnings.push("Ibovespa indisponível no momento.");
  if (!opts.sp500Usd?.length) warnings.push("S&P 500 indisponível no momento.");
  if (!opts.cdiRates?.length) warnings.push("CDI indisponível no momento.");
  return { points, missing, warnings, generatedAt: new Date().toISOString() };
}

// ---------- data loading ----------

/** Daily CDI rate (% a.d.) from the Banco Central SGS series 12 — public, no key. */
async function bcbCdi(start: string, end: string): Promise<Close[]> {
  const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${f(start)}&dataFinal=${f(end)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`BCB ${r.status}`);
  const rows = (await r.json()) as { data: string; valor: string }[];
  return rows.map((x) => ({ date: `${x.data.slice(6, 10)}-${x.data.slice(3, 5)}-${x.data.slice(0, 2)}`, close: Number(x.valor) })).filter((x) => Number.isFinite(x.close));
}

const g = globalThis as unknown as { __evo?: { key: string; at: number; data: Evolution } };
const TTL_MS = 5 * 60_000;

/** Editing a transaction does not change the cache key (count / created-at): drop the cache explicitly. */
export function invalidateEvolution() {
  g.__evo = undefined;
}

export async function loadEvolution(force = false): Promise<Evolution> {
  const [txCount, divCount, lastTx, lastDiv] = await Promise.all([
    db.transaction.count(),
    db.dividend.count(),
    db.transaction.aggregate({ _max: { createdAt: true } }),
    db.dividend.aggregate({ _max: { createdAt: true } }),
  ]);
  const key = `${txCount}:${divCount}:${lastTx._max.createdAt?.getTime()}:${lastDiv._max.createdAt?.getTime()}`;
  if (!force && g.__evo && g.__evo.key === key && Date.now() - g.__evo.at < TTL_MS) return g.__evo.data;

  const rows = await db.asset.findMany({ where: { transactions: { some: {} } }, include: { transactions: true, dividends: true } });
  const today = new Date().toISOString().slice(0, 10);
  const first = rows.flatMap((a) => a.transactions).reduce((m, t) => (t.date < m ? t.date : m), new Date());
  const days = Math.ceil((Date.now() - +first) / 86_400_000) + 10;

  const hist = async (symbol: string) => {
    try { return await yahooHistory(symbol, days); } catch (e) { console.warn("[evolution]", symbol, (e as Error).message); return [] as Close[]; }
  };
  const startStr = first.toISOString().slice(0, 10);
  const [assetCloses, fx, ibov, sp500Usd, cdiRates] = await Promise.all([
    Promise.all(rows.map((a) => hist(yahooSymbol({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency })))),
    hist("BRL=X"),
    hist("^BVSP"),
    hist("^GSPC"),
    bcbCdi(startStr, today).catch((e) => { console.warn("[evolution] cdi", (e as Error).message); return [] as Close[]; }),
  ]);

  const data = computeEvolution({
    assets: rows.map((a, i) => ({
      ref: { ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency },
      txs: a.transactions,
      closes: assetCloses[i],
      divs: a.dividends.map((d) => ({ date: d.date, net: netOf(d) })),
    })),
    fx,
    end: today,
    cdiRates,
    ibov,
    sp500Usd,
  });
  g.__evo = { key, at: Date.now(), data };
  return data;
}
