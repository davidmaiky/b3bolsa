import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { priceService } from "@/lib/prices";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";

const Body = z.object({
  ticker: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase().replace(/\.SA$/, "")),
  name: z.string().trim().max(120).optional(),
  assetClass: z.enum(["B3", "US", "CRYPTO", "FX"]),
  watchlist: z.boolean().optional(),
});

export async function GET() {
  const assets = await db.asset.findMany({ orderBy: { ticker: "asc" } });
  return NextResponse.json(assets);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { ticker, name, assetClass, watchlist } = parsed.data;
  const currency = assetClass === "B3" || assetClass === "FX" ? "BRL" : "USD";
  const asset = await db.asset.upsert({
    where: { ticker },
    create: { ticker, name, assetClass, currency, watchlist: watchlist ?? false },
    update: { name: name || undefined, watchlist: watchlist ?? undefined },
  });
  priceService.track([{ ticker, assetClass: assetClass as AssetClass, currency }]);
  return NextResponse.json(asset);
}
