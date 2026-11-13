import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  vacancyPhysical: z.number().min(0).max(100).nullable().default(null),
  vacancyFinancial: z.number().min(0).max(100).nullable().default(null),
  segment: z.string().trim().max(40).nullable().default(null),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json((await db.fiiInfo.findUnique({ where: { assetId: id } })) ?? {});
}

/** Vacancy and segment come from the fund's monthly report: the user types them in. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  if (asset.assetClass !== "FII") return NextResponse.json({ error: "Só vale para ativos da classe FII" }, { status: 400 });
  const d = { ...parsed.data, segment: parsed.data.segment || null };
  await db.fiiInfo.upsert({ where: { assetId: id }, create: { assetId: id, ...d }, update: d });
  return NextResponse.json({ ok: true });
}
