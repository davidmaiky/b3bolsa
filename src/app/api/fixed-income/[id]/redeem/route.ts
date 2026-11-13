import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadFixedIncome } from "@/lib/fixed-income-server";
import { invalidateEvolution } from "@/lib/evolution";

export const runtime = "nodejs";

const Body = z.object({ date: z.string().min(8), net: z.number().nonnegative().optional() });

/** Marks an application as redeemed. Without `net`, the estimated net value on that date is recorded. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Informe a data do resgate" }, { status: 400 });
  const row = await db.fixedIncome.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
  if (row.redeemedAt) return NextResponse.json({ error: "Essa aplicação já foi resgatada" }, { status: 400 });
  const date = new Date(parsed.data.date);
  if (Number.isNaN(+date)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  if (date < row.startDate) return NextResponse.json({ error: "O resgate não pode ser antes da aplicação" }, { status: 400 });

  let net = parsed.data.net;
  if (net === undefined) {
    const est = (await loadFixedIncome(date.toISOString().slice(0, 10))).items.find((i) => i.id === id)?.value;
    if (!est) return NextResponse.json({ error: "Sem dados do CDI para estimar: informe o valor líquido recebido" }, { status: 400 });
    net = est.net;
  }
  await db.fixedIncome.update({ where: { id }, data: { redeemedAt: date, redeemedNet: net } });
  invalidateEvolution();
  return NextResponse.json({ ok: true, net });
}
