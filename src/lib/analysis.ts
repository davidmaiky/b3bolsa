import { db } from "./db";
import { yahooFundamentals, yahooHistory, type Fundamentals } from "./yahoo";
import { yahooSymbol } from "./lse/symbols";
import { momentum, valuation, type Momentum, type ValuationSignals } from "./indicators";
import { priceService } from "./prices";
import { computePosition } from "./portfolio";
import { hasFundamentals } from "./classify";
import { getPeers } from "./peers-server";
import type { PeerComparison } from "./peers";
import { getFiiMetrics } from "./fii-server";
import type { FiiMetrics } from "./fii";
import type { AssetClass, AssetRef } from "./types";

const FUND_TTL_MS = 24 * 3600_000;

export async function getFundamentals(asset: { id: string } & AssetRef, force = false): Promise<Fundamentals | null> {
  if (!hasFundamentals(asset.assetClass)) return null;
  const cached = await db.fundamentals.findUnique({ where: { assetId: asset.id } });
  if (cached && !force && Date.now() - +cached.updatedAt < FUND_TTL_MS) return JSON.parse(cached.data);
  try {
    const f = await yahooFundamentals(yahooSymbol(asset));
    await db.fundamentals.upsert({
      where: { assetId: asset.id },
      create: { assetId: asset.id, data: JSON.stringify(f) },
      update: { data: JSON.stringify(f) },
    });
    return f;
  } catch (e) {
    console.warn("[fundamentals]", asset.ticker, (e as Error).message);
    return cached ? JSON.parse(cached.data) : null;
  }
}

export interface AssetAnalysis {
  ticker: string;
  name: string | null;
  assetClass: AssetClass;
  currency: string;
  price?: number;
  priceSource?: string;
  position: { quantity: number; avgPrice: number; unrealizedPct?: number } | null;
  fundamentals: Fundamentals | null;
  valuation: ValuationSignals | null;
  momentum: Momentum;
  peers: PeerComparison | null;
  fii: FiiMetrics | null; // só FIIs
}

export interface AssetAnalysisWithHistory extends AssetAnalysis {
  history: { date: string; close: number }[];
}

export async function analyzeAsset(assetId: string): Promise<AssetAnalysisWithHistory> {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId }, include: { transactions: true } });
  const ref = { ticker: asset.ticker, assetClass: asset.assetClass as AssetClass, currency: asset.currency };
  priceService.track([ref]);
  const q = priceService.get(ref);
  const [fundamentals, hist] = await Promise.all([
    getFundamentals({ id: asset.id, ...ref }),
    yahooHistory(yahooSymbol(ref), 400).catch((e) => {
      console.warn("[history]", ref.ticker, (e as Error).message);
      return [] as { date: string; close: number }[];
    }),
  ]);
  const peers = await getPeers({ id: asset.id, ...ref }, fundamentals).catch(() => null);
  const price = q?.price ?? fundamentals?.price;
  const fii = await getFiiMetrics({ id: asset.id, ...ref }, fundamentals, price).catch(() => null);
  const mom: Momentum = hist.length ? momentum(hist.map((h) => h.close), ref.assetClass === "CRYPTO" ? 365 : 252) : {};

  const pos = asset.transactions.length ? computePosition(asset.transactions) : null;
  return {
    ticker: asset.ticker,
    name: asset.name,
    assetClass: ref.assetClass,
    currency: asset.currency,
    price,
    priceSource: q?.source,
    position:
      pos && pos.quantity > 0
        ? {
            quantity: pos.quantity,
            avgPrice: pos.avgPrice,
            unrealizedPct: price ? (price / pos.avgPrice - 1) * 100 : undefined,
          }
        : null,
    fundamentals,
    valuation: fundamentals && (ref.assetClass === "B3" || ref.assetClass === "US") ? valuation(fundamentals, price) : null,
    momentum: mom,
    peers,
    fii,
    history: hist,
  };
}
