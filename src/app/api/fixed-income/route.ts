import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FixedIncomeBody } from "@/lib/fixed-income-schema";
import { loadFixedIncome } from "@/lib/fixed-income-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await loadFixedIncome());
}

export async function POST(req: Request) {
  const parsed = FixedIncomeBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const row = await db.fixedIncome.create({
    data: { ...d, label: d.label || null, note: d.note || null, startDate: new Date(d.startDate), maturityDate: new Date(d.maturityDate) },
  });
  return NextResponse.json(row);
}
