import { db } from "./db";
import { computePosition, type Position } from "./portfolio";
import { priceService } from "./prices";
import type { AssetClass, AssetRef } from "./types";

export interface PositionRow extends Position {
  assetId: string;
  ticker: string;
  name: string | null;
  assetClass: AssetClass;
  currency: string;
  watchlist: boolean;
  quoteKey: string;
}

export async function loadPositions(): Promise<PositionRow[]> {
  const assets = await db.asset.findMany({ include: { transactions: true }, orderBy: { ticker: "asc" } });
  const refs: AssetRef[] = assets.map((a) => ({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency }));
  priceService.track(refs);
  return assets.map((a) => ({
    assetId: a.id,
    ticker: a.ticker,
    name: a.name,
    assetClass: a.assetClass as AssetClass,
    currency: a.currency,
    watchlist: a.watchlist,
    quoteKey: `${a.ticker.toUpperCase()}:${a.assetClass}`,
    ...computePosition(a.transactions),
  }));
}

/** BRL value of each held position using the latest known quotes. */
export function weightsBrl(rows: PositionRow[]) {
  const fx = priceService.quotes.get("USD:FX")?.price ?? 0;
  const values: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    const q = priceService.quotes.get(r.quoteKey);
    const v = (q?.price ?? r.avgPrice) * r.quantity * (r.currency === "USD" ? fx : 1);
    values[r.ticker] = v;
    total += v;
  }
  const weights = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, total ? (v / total) * 100 : 0]));
  return { totalBrl: total, weights };
}
