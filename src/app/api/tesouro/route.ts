import { NextResponse } from "next/server";
import { getTesouroTitles } from "@/lib/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tesouro Direto titles available today, with sell price (PU) and rate. Source: Tesouro Transparente. */
export async function GET() {
  try {
    const rows = await getTesouroTitles();
    if (!rows.length) return NextResponse.json({ error: "Não consegui ler a lista do Tesouro Direto agora" }, { status: 502 });
    return NextResponse.json({ date: rows[0].date, titles: rows.map((r) => ({ title: r.title, maturity: r.maturity, puSell: r.puSell, rateSell: r.rateSell })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
