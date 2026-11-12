import { NextResponse } from "next/server";
import { analyzeAsset } from "@/lib/analysis";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await db.asset.findUnique({
    where: { id },
    include: { transactions: { orderBy: { date: "desc" } }, suggestions: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const { history, ...analysis } = await analyzeAsset(id);
  return NextResponse.json({ asset, analysis, history: history.slice(-252) });
}
