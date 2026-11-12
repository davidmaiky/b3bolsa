import { NextResponse } from "next/server";
import { yahooSearch } from "@/lib/yahoo";

export const runtime = "nodejs";

const CLASS_BY_TYPE = (s: { symbol: string; type: string }) => {
  if (s.symbol.endsWith(".SA")) return "B3";
  if (s.type === "CRYPTOCURRENCY") return "CRYPTO";
  if (s.type === "CURRENCY") return "FX";
  if (s.type === "EQUITY" || s.type === "ETF") return s.symbol.includes(".") ? null : "US";
  return null;
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  try {
    const rows = await yahooSearch(q);
    const out = rows
      .map((r) => {
        const assetClass = CLASS_BY_TYPE(r);
        if (!assetClass) return null;
        let ticker = r.symbol.replace(/\.SA$/, "");
        if (assetClass === "CRYPTO") ticker = ticker.replace(/-USD$/, "");
        if (assetClass === "FX") ticker = ticker.replace(/BRL=X$/, "").replace(/^BRL=X$/, "USD");
        return { ticker, name: r.name, assetClass };
      })
      .filter(Boolean);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
