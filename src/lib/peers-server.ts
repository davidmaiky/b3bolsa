import { db } from "./db";
import { yahooFundamentals, yahooSimilar } from "./yahoo";
import { yahooSymbol } from "./lse/symbols";
import { comparePeers, type PeerComparison, type PeerRow } from "./peers";
import type { AssetClass, AssetRef } from "./types";
import type { Fundamentals } from "./yahoo";

const TTL_MS = 7 * 24 * 3600_000;
const MAX_PEERS = 8;
const WAIT_MS = 12_000;

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

async function fetchCandidates(ref: AssetRef): Promise<PeerRow[]> {
  const similar = (await yahooSimilar(yahooSymbol(ref))).slice(0, MAX_PEERS);
  const rows = await inBatches(similar, 4, async (sym) => {
    try {
      const f = await yahooFundamentals(sym);
      return { ticker: sym.replace(/\.SA$/, ""), sector: f.sector, pe: f.pe, pb: f.pb, dy: f.dividendYield, roe: f.roe } as PeerRow;
    } catch {
      return null;
    }
  });
  return rows.filter((r): r is PeerRow => r !== null);
}

/**
 * Peer comparison for stocks (B3/US), cached for 7 days. If Yahoo is slow the caller gets null after
 * a few seconds while the fetch keeps going and fills the cache for next time.
 */
export async function getPeers(asset: { id: string } & AssetRef, f: Fundamentals | null): Promise<PeerComparison | null> {
  if ((asset.assetClass !== "B3" && asset.assetClass !== "US") || !f) return null; // FII/ETF: sem comparação por P/L
  const cached = await db.peerCache.findUnique({ where: { assetId: asset.id } });
  const fresh = cached && Date.now() - +cached.updatedAt < TTL_MS;
  const self = { pe: f.pe, pb: f.pb, sector: f.sector };
  if (fresh) return comparePeers(self, JSON.parse(cached.data));

  const work = fetchCandidates({ ticker: asset.ticker, assetClass: asset.assetClass as AssetClass, currency: asset.currency })
    .then(async (rows) => {
      if (rows.length) {
        await db.peerCache.upsert({ where: { assetId: asset.id }, create: { assetId: asset.id, data: JSON.stringify(rows) }, update: { data: JSON.stringify(rows) } });
      }
      return rows;
    })
    .catch((e) => {
      console.warn("[peers]", asset.ticker, (e as Error).message);
      return cached ? (JSON.parse(cached.data) as PeerRow[]) : [];
    });
  const rows = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), WAIT_MS))]);
  if (rows === null) return cached ? comparePeers(self, JSON.parse(cached.data)) : null;
  return comparePeers(self, rows);
}
