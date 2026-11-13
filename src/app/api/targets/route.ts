import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ B3: z.number().min(0).max(100), FII: z.number().min(0).max(100).default(0), ETF: z.number().min(0).max(100).default(0), US: z.number().min(0).max(100), CRYPTO: z.number().min(0).max(100), FX: z.number().min(0).max(100) });

export async function GET() {
  const rows = await db.allocationTarget.findMany();
  return NextResponse.json(Object.fromEntries(rows.map((r) => [r.assetClass, r.percent])));
}

/** Replaces the targets. Percentages must add up to 100 (or all be 0 to clear them). */
export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Informe um percentual de 0 a 100 para cada classe" }, { status: 400 });
  const sum = Object.values(parsed.data).reduce((s, v) => s + v, 0);
  if (sum !== 0 && Math.abs(sum - 100) > 0.01) return NextResponse.json({ error: `As metas somam ${sum.toFixed(2)}%: precisam somar 100%` }, { status: 400 });
  await db.$transaction([
    db.allocationTarget.deleteMany(),
    ...(sum === 0 ? [] : Object.entries(parsed.data).filter(([, v]) => v > 0).map(([assetClass, percent]) => db.allocationTarget.create({ data: { assetClass, percent } }))),
  ]);
  return NextResponse.json({ ok: true });
}
