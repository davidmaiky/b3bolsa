import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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
  if (d.type === "SELL") {
    const txs = await db.transaction.findMany({ where: { assetId: d.assetId } });
    const held = txs.reduce((s, t) => s + (t.type === "BUY" ? t.quantity : -t.quantity), 0);
    if (d.quantity > held + 1e-9) return NextResponse.json({ error: `Quantidade maior que a posição (${held})` }, { status: 400 });
  }
  const tx = await db.transaction.create({ data: { ...d, date: new Date(d.date) } });
  return NextResponse.json(tx);
}
