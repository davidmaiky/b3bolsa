import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FixedIncomeBody } from "@/lib/fixed-income-schema";

export const runtime = "nodejs";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Full replacement of the contract terms (the form always sends every field). `reopen: true` undoes a redemption. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await db.fixedIncome.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
  if (body.reopen === true) {
    await db.fixedIncome.update({ where: { id }, data: { redeemedAt: null, redeemedNet: null } });
    return NextResponse.json({ ok: true });
  }
  const merged = {
    kind: current.kind, issuer: current.issuer, label: current.label, indexer: current.indexer, rate: current.rate, principal: current.principal,
    startDate: day(current.startDate), maturityDate: day(current.maturityDate), liquidity: current.liquidity, fgc: current.fgc, note: current.note,
    ...body,
  };
  const parsed = FixedIncomeBody.safeParse(merged);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  await db.fixedIncome.update({ where: { id }, data: { ...d, label: d.label || null, note: d.note || null, startDate: new Date(d.startDate), maturityDate: new Date(d.maturityDate) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.fixedIncome.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
