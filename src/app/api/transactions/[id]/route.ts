import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findOversell } from "@/lib/portfolio";
import { invalidateEvolution } from "@/lib/evolution";

export const runtime = "nodejs";

const Patch = z.object({
  type: z.enum(["BUY", "SELL"]).optional(),
  quantity: z.number().positive().optional(),
  price: z.number().nonnegative().optional(),
  fees: z.number().nonnegative().optional(),
  date: z.string().min(8).optional(),
  note: z.string().max(300).nullable().optional(),
});

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Edits one transaction (the asset stays the same). The whole history must still make sense afterwards. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const current = await db.transaction.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 });

  const { date, ...rest } = parsed.data;
  const next = { ...rest, ...(date ? { date: new Date(date) } : {}) };
  if (date && Number.isNaN(+next.date!)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const others = await db.transaction.findMany({ where: { assetId: current.assetId, NOT: { id } } });
  const merged = { ...current, ...next };
  const bad = findOversell([...others, merged]);
  if (bad) return NextResponse.json({ error: `Com essa alteração a posição ficaria negativa em ${br(bad)}: há uma venda maior do que as compras até a data` }, { status: 400 });

  const tx = await db.transaction.update({ where: { id }, data: next });
  invalidateEvolution();
  return NextResponse.json(tx);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.transaction.delete({ where: { id } });
  invalidateEvolution();
  return NextResponse.json({ ok: true });
}
