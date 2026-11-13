import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { yahooHistory } from "@/lib/yahoo";
import { computeTax } from "@/lib/tax";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const rows = await db.asset.findMany({ where: { transactions: { some: {} } }, include: { transactions: true } });
  if (!rows.length) return NextResponse.json({ months: [], years: [], sales: [], warnings: [], holdings: {}, firstYear: null });
  const first = rows.flatMap((a) => a.transactions).reduce((m, t) => (t.date < m ? t.date : m), new Date());
  const needsFx = rows.some((a) => a.currency === "USD");
  const fx = needsFx ? await yahooHistory("BRL=X", Math.ceil((Date.now() - +first) / 86_400_000) + 10).catch(() => []) : [];
  try {
    const { holdingsAt, ...tax } = computeTax(
      rows.map((a) => ({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency, txs: a.transactions })),
      fx,
    );
    const now = new Date();
    const holdings: Record<string, ReturnType<typeof holdingsAt>> = {};
    for (let y = first.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
      holdings[y] = holdingsAt(y === now.getUTCFullYear() ? now.toISOString().slice(0, 10) : `${y}-12-31`);
    }
    return NextResponse.json({ ...tax, holdings, firstYear: first.getUTCFullYear() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
