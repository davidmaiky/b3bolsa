import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FixedIncomeBody, toDb } from "@/lib/fixed-income-schema";
import { invalidateEvolution } from "@/lib/evolution";

export const runtime = "nodejs";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Edits the contract terms (fields not sent keep their value). `reopen: true` undoes a redemption; `seenDue: true` dismisses the maturity notice. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await db.fixedIncome.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
  if (body.reopen === true) {
    await db.fixedIncome.update({ where: { id }, data: { redeemedAt: null, redeemedNet: null } });
    invalidateEvolution();
    return NextResponse.json({ ok: true });
  }
  if (body.seenDue === true) {
    await db.fixedIncome.update({ where: { id }, data: { dueSeenAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  const merged = {
    kind: current.kind, issuer: current.issuer, label: current.label, indexer: current.indexer, rate: current.rate, principal: current.principal,
    startDate: day(current.startDate), maturityDate: day(current.maturityDate), liquidity: current.liquidity, fgc: current.fgc, note: current.note,
    tdTitle: current.tdTitle, quantity: current.quantity,
    ...body,
  };
  const parsed = FixedIncomeBody.safeParse(merged);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const data = toDb(parsed.data);
  // a new maturity date means the maturity notices start over
  const moved = day(data.maturityDate) !== day(current.maturityDate);
  await db.fixedIncome.update({ where: { id }, data: { ...data, ...(moved ? { dueNotifiedAt: null, dueSeenAt: null } : {}) } });
  invalidateEvolution();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.fixedIncome.deleteMany({ where: { id } });
  invalidateEvolution();
  return NextResponse.json({ ok: true });
}
