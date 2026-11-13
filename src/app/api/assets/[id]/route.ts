import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceService } from "@/lib/prices";
import type { AssetClass } from "@/lib/types";
import { alertService } from "@/lib/alert-service";
import { isB3Listed } from "@/lib/classify";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.asset.delete({ where: { id } });
  priceService.untrack({ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { watchlist?: boolean; name?: string; assetClass?: string };
  const before = await db.asset.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  // reclassify only among B3-listed classes (same currency and Yahoo symbol)
  if (body.assetClass !== undefined && !(isB3Listed(body.assetClass) && isB3Listed(before.assetClass))) {
    return NextResponse.json({ error: "A classe só pode mudar entre Ações B3, FIIs e ETFs B3" }, { status: 400 });
  }
  const a = await db.asset.update({ where: { id }, data: { watchlist: body.watchlist, name: body.name, assetClass: body.assetClass } });
  if (body.assetClass && body.assetClass !== before.assetClass) {
    // the price key includes the class: move tracking to the new key
    priceService.untrack({ ticker: before.ticker, assetClass: before.assetClass as AssetClass, currency: before.currency });
    priceService.track([{ ticker: a.ticker, assetClass: a.assetClass as AssetClass, currency: a.currency }]);
    await alertService.reload();
  }
  return NextResponse.json(a);
}
