import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { yahooHistory } from "@/lib/yahoo";
import { computeTax } from "@/lib/tax";
import { fixedIncomeTaxSummary } from "@/lib/fixed-income-tax";
import { loadRates, termsOf } from "@/lib/fixed-income-server";
import { rowLabel } from "@/lib/fixed-income";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const rows = await db.asset.findMany({ where: { transactions: { some: {} } }, include: { transactions: true } });
  const fixedRows = await db.fixedIncome.findMany();
  if (!rows.length && !fixedRows.length) return NextResponse.json({ months: [], years: [], sales: [], warnings: [], holdings: {}, firstYear: null, fixedIncome: [], fixedMissing: [] });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const firstTx = rows.flatMap((a) => a.transactions).reduce((m, t) => (t.date < m ? t.date : m), now);
  const firstYear = Math.min(firstTx.getUTCFullYear(), ...fixedRows.map((r) => r.startDate.getUTCFullYear()));
  const needsFx = rows.some((a) => a.currency === "USD");
  const fx = needsFx ? await yahooHistory("BRL=X", Math.ceil((Date.now() - +firstTx) / 86_400_000) + 10).catch(() => []) : [];
  try {
    const { holdingsAt, ...tax } = computeTax(
      rows.map((a) => ({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency, txs: a.transactions })),
      fx,
    );
    const holdings: Record<string, ReturnType<typeof holdingsAt>> = {};
    for (let y = firstTx.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
      holdings[y] = holdingsAt(y === now.getUTCFullYear() ? today : `${y}-12-31`);
    }

    let fixedIncome: ReturnType<typeof fixedIncomeTaxSummary> = [];
    let fixedMissing: string[] = [];
    if (fixedRows.length) {
      const { rates, missing } = await loadRates(fixedRows.map((r) => ({ indexer: r.indexer, startDate: r.startDate.toISOString().slice(0, 10), maturityDate: r.maturityDate.toISOString().slice(0, 10), tdTitle: r.tdTitle })));
      fixedMissing = missing;
      const fiFirst = Math.min(...fixedRows.map((r) => r.startDate.getUTCFullYear()));
      const years = Array.from({ length: now.getUTCFullYear() - fiFirst + 1 }, (_, i) => fiFirst + i);
      fixedIncome = fixedIncomeTaxSummary(
        fixedRows.map((r) => ({ id: r.id, label: rowLabel(r), issuer: r.issuer, terms: termsOf(r), redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString().slice(0, 10) : null, redeemedNet: r.redeemedNet })),
        rates, years, today,
      );
    }
    return NextResponse.json({ ...tax, holdings, firstYear, fixedIncome, fixedMissing });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
