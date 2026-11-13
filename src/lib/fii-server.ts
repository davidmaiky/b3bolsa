import { db } from "./db";
import { yahooDividends } from "./yahoo";
import { yahooSymbol } from "./lse/symbols";
import { fiiMetrics, type FiiMetrics } from "./fii";
import type { Fundamentals } from "./yahoo";
import type { AssetClass, AssetRef } from "./types";

const TTL_MS = 6 * 3600_000;
const g = globalThis as unknown as { __mktDivs?: Map<string, { at: number; rows: { date: string; amount: number }[] }> };
const cache = (g.__mktDivs ??= new Map());

/** Market dividend history (Yahoo, by ex-date), cached in memory for a few hours. */
async function marketDividends(ref: AssetRef) {
  const sym = yahooSymbol(ref);
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  try {
    const rows = await yahooDividends(sym, new Date(Date.now() - 400 * 86_400_000));
    cache.set(sym, { at: Date.now(), rows });
    return rows;
  } catch (e) {
    console.warn("[fii] dividends", sym, (e as Error).message);
    return hit?.rows ?? [];
  }
}

export async function getFiiMetrics(asset: { id: string } & AssetRef, f: Fundamentals | null, price?: number): Promise<FiiMetrics | null> {
  if (asset.assetClass !== "FII") return null;
  const [dividends, info] = await Promise.all([
    marketDividends({ ticker: asset.ticker, assetClass: asset.assetClass as AssetClass, currency: asset.currency }),
    db.fiiInfo.findUnique({ where: { assetId: asset.id } }),
  ]);
  return fiiMetrics({
    price: price ?? f?.price,
    vpa: f?.bookValuePerShare,
    dividends,
    vacancyPhysical: info?.vacancyPhysical,
    vacancyFinancial: info?.vacancyFinancial,
    segment: info?.segment,
  });
}
