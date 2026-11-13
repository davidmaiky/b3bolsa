import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findOversell } from "@/lib/portfolio";
import { invalidateEvolution } from "@/lib/evolution";

export const runtime = "nodejs";

const Body = z.object({
  assetId: z.string().min(1),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  fees: z.number().nonnegative().default(0),
  date: z.string().min(8),
  note: z.string().max(300).optional(),
});

export async function GET() {
  const txs = await db.transaction.findMany({ include: { asset: true }, orderBy: { date: "desc" } });
  return NextResponse.json(txs);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  // the whole history must stay valid: a sale cannot be larger than the position held on its date
  const existing = await db.transaction.findMany({ where: { assetId: d.assetId } });
  const bad = findOversell([...existing, { type: d.type, quantity: d.quantity, price: d.price, fees: d.fees, date: d.date }]);
  if (bad) return NextResponse.json({ error: `Quantidade maior que a posição em ${bad.slice(8, 10)}/${bad.slice(5, 7)}/${bad.slice(0, 4)}` }, { status: 400 });
  const tx = await db.transaction.create({ data: { ...d, date: new Date(d.date) } });
  invalidateEvolution();
  return NextResponse.json(tx);
}
