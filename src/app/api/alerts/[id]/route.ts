import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { alertService } from "@/lib/alert-service";

export const runtime = "nodejs";

const Patch = z.object({ active: z.boolean().optional(), seen: z.boolean().optional() });

/** active:true re-arms a triggered alert; seen:true dismisses its notification. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { active, seen } = parsed.data;
  const data: Record<string, unknown> = {};
  if (active === true) Object.assign(data, { active: true, triggeredAt: null, triggerPrice: null, seenAt: null });
  if (active === false) data.active = false;
  if (seen) data.seenAt = new Date();
  if (!(await db.alert.findUnique({ where: { id } }))) return NextResponse.json({ error: "Alerta não encontrado" }, { status: 404 });
  if (Object.keys(data).length) await db.alert.update({ where: { id }, data });
  await alertService.reload();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.alert.deleteMany({ where: { id } });
  await alertService.reload();
  return NextResponse.json({ ok: true });
}
