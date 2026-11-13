import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { DIVIDEND_TYPES } from "@/lib/dividends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  assetId: z.string().min(1),
  type: z.enum(DIVIDEND_TYPES),
  date: z.string().min(8),
  perShare: z.number().positive(),
  quantity: z.number().positive(),
  tax: z.number().nonnegative().default(0),
  note: z.string().max(300).optional(),
});

export async function GET() {
  return NextResponse.json(await db.dividend.findMany({ include: { asset: true }, orderBy: { date: "desc" } }));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  if (d.tax > d.perShare * d.quantity) return NextResponse.json({ error: "Imposto maior que o valor bruto" }, { status: 400 });
  const asset = await db.asset.findUnique({ where: { id: d.assetId } });
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  return NextResponse.json(await db.dividend.create({ data: { ...d, date: new Date(d.date) } }));
}
