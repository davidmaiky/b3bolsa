import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadFixedIncome } from "@/lib/fixed-income-server";
import { invalidateEvolution } from "@/lib/evolution";
import { looksPartial, partialFraction } from "@/lib/fixed-income";
import { fmtMoney } from "@/lib/format";

export const runtime = "nodejs";

const Body = z.object({
  date: z.string().min(8),
  net: z.number().nonnegative().optional(),
  partial: z.boolean().default(false), // resgate parcial: só parte do saldo saiu, o resto continua aplicado
  force: z.boolean().default(false), // confirma um resgate total de valor bem menor que o saldo estimado
});

/**
 * Redeems an application.
 * - total: the whole application leaves (net = value received, or the estimate when omitted);
 * - partial: `net` is the amount taken out; the application is split in two by that fraction (everything scales with the principal),
 *   the redeemed part is stored as redeemed and the rest stays active with the same start date and terms.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Informe a data do resgate" }, { status: 400 });
  const { partial, force } = parsed.data;
  const row = await db.fixedIncome.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
  if (row.redeemedAt) return NextResponse.json({ error: "Essa aplicação já foi resgatada" }, { status: 400 });
  const date = new Date(parsed.data.date);
  if (Number.isNaN(+date)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  if (date < row.startDate) return NextResponse.json({ error: "O resgate não pode ser antes da aplicação" }, { status: 400 });

  const estimate = (await loadFixedIncome(date.toISOString().slice(0, 10))).items.find((i) => i.id === id)?.value ?? null;

  if (partial) {
    const f = partialFraction(estimate?.net, parsed.data.net ?? 0);
    if ("error" in f) return NextResponse.json({ error: f.error }, { status: 400 });
    const keep = 1 - f.fraction;
    const { id: _id, createdAt: _c, ...copy } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
    await db.$transaction([
      db.fixedIncome.create({
        data: { ...copy, principal: row.principal * f.fraction, quantity: row.quantity === null ? null : row.quantity * f.fraction, redeemedAt: date, redeemedNet: parsed.data.net!, dueNotifiedAt: null, dueSeenAt: null },
      }),
      db.fixedIncome.update({ where: { id }, data: { principal: row.principal * keep, quantity: row.quantity === null ? null : row.quantity * keep } }),
    ]);
    invalidateEvolution();
    return NextResponse.json({ ok: true, partial: true, net: parsed.data.net, remainingPrincipal: row.principal * keep, estimatedNet: estimate?.net ?? null });
  }

  let net = parsed.data.net;
  if (net === undefined) {
    if (!estimate) return NextResponse.json({ error: "Sem dados de mercado para estimar: informe o valor líquido recebido" }, { status: 400 });
    net = estimate.net;
  } else if (!force && looksPartial(estimate?.net, net)) {
    return NextResponse.json(
      {
        code: "LOOKS_PARTIAL",
        error: `O valor informado (${fmtMoney(net)}) é bem menor que o saldo líquido estimado (${fmtMoney(estimate!.net)}). Se você resgatou só uma parte, use "Resgate parcial": o resto continua aplicado. Se resgatou tudo, confirme o resgate total.`,
        estimatedNet: estimate!.net,
      },
      { status: 409 },
    );
  }
  await db.fixedIncome.update({ where: { id }, data: { redeemedAt: date, redeemedNet: net } });
  invalidateEvolution();
  return NextResponse.json({ ok: true, partial: false, net });
}
