import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceService } from "@/lib/prices";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.asset.delete({ where: { id } });
  priceService.untrack({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { watchlist?: boolean; name?: string };
  const a = await db.asset.update({ where: { id }, data: { watchlist: body.watchlist, name: body.name } });
  return NextResponse.json(a);
}
