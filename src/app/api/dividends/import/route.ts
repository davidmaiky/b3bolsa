import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { yahooDividends } from "@/lib/yahoo";
import { yahooSymbol } from "@/lib/lse/symbols";
import { quantityAt } from "@/lib/dividends";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Imports dividends from Yahoo for B3/US assets, using the shares held on each ex-date.
 * body: { assetId?: string } — default: every asset with transactions. Skips entries already stored.
 * Yahoo gives gross amounts per share and no tax data: edit/replace entries if you need the net figure.
 */
export async function POST(req: Request) {
  const { assetId } = (await req.json().catch(() => ({}))) as { assetId?: string };
  const assets = await db.asset.findMany({
    where: { ...(assetId ? { id: assetId } : {}), assetClass: { in: ["B3", "US"] }, transactions: { some: {} } },
    include: { transactions: true, dividends: true },
  });

  let added = 0;
  const errors: string[] = [];
  for (const a of assets) {
    const first = a.transactions.reduce((m, t) => (t.date < m ? t.date : m), a.transactions[0].date);
    try {
      const list = await yahooDividends(yahooSymbol({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency }), first);
      for (const d of list) {
        const qty = quantityAt(a.transactions, d.date);
        if (qty <= 0) continue;
        const exists = a.dividends.some((x) => x.date.toISOString().slice(0, 10) === d.date && Math.abs(x.perShare - d.amount) < 1e-9);
        if (exists) continue;
        await db.dividend.create({
          data: { assetId: a.id, type: "DIVIDENDO", date: new Date(d.date), perShare: d.amount, quantity: qty, source: "yahoo", note: "Importado do Yahoo (data ex, valor bruto)" },
        });
        added++;
      }
    } catch (e) {
      errors.push(`${a.ticker}: ${(e as Error).message}`);
    }
  }
  return NextResponse.json({ added, checked: assets.length, errors });
}
