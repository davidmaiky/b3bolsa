import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { alertService } from "@/lib/alert-service";
import { getFundamentals } from "@/lib/analysis";
import { ALERT_TYPES, isDynamic, isTriggered, thresholdFor } from "@/lib/alerts";
import { priceService } from "@/lib/prices";
import type { AssetClass } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  assetId: z.string().min(1),
  type: z.enum(ALERT_TYPES),
  target: z.number().positive().optional(),
  note: z.string().max(200).optional(),
});

export async function GET() {
  alertService.start();
  const rows = await db.alert.findMany({ include: { asset: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(
    rows.map((a) => ({
      ...a,
      price: priceService.get({ ticker: a.asset.ticker, assetClass: a.asset.assetClass as AssetClass, currency: a.asset.currency })?.price ?? null,
      threshold: a.active ? alertService.thresholdOf(a.id) ?? thresholdFor(a.type, a.target, null) ?? null : a.target,
    })),
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  if (!isDynamic(d.type) && !d.target) return NextResponse.json({ error: "Informe o preço-alvo" }, { status: 400 });
  const asset = await db.asset.findUnique({ where: { id: d.assetId } });
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const ref = { ticker: asset.ticker, assetClass: asset.assetClass as AssetClass, currency: asset.currency };

  priceService.track([ref]);
  const price = priceService.get(ref)?.price;
  const threshold = thresholdFor(d.type, d.target, isDynamic(d.type) ? await getFundamentals({ id: asset.id, ...ref }) : null);
  if (isDynamic(d.type) && threshold === undefined) {
    return NextResponse.json({ error: "Sem dados suficientes (dividendos ou LPA/VPA) para calcular esse nível neste ativo" }, { status: 400 });
  }
  if (price !== undefined && isTriggered(d.type, price, threshold)) {
    return NextResponse.json({ error: `Esse nível já foi atingido: o preço atual é ${price}` }, { status: 400 });
  }
  const alert = await db.alert.create({ data: { assetId: d.assetId, type: d.type, target: isDynamic(d.type) ? null : d.target, note: d.note } });
  await alertService.reload();
  return NextResponse.json(alert);
}
