import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeAsset } from "@/lib/analysis";
import { geminiConfigured, geminiModel, suggest } from "@/lib/llm/gemini";
import { loadPositions, weightsBrl } from "@/lib/server-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const rows = await db.suggestion.findMany({ include: { asset: true }, orderBy: { createdAt: "desc" }, take: 60 });
  return NextResponse.json(rows);
}

/** body: { assetIds?: string[] } — default: every held position + watchlist. */
export async function POST(req: Request) {
  if (!geminiConfigured()) return NextResponse.json({ error: "Configure GEMINI_API_KEY no arquivo .env e reinicie o servidor" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { assetIds?: string[] };
  const positions = await loadPositions();
  const ids = body.assetIds?.length
    ? body.assetIds
    : positions.filter((p) => p.quantity > 0 || p.watchlist).map((p) => p.assetId);
  if (!ids.length) return NextResponse.json({ error: "Nenhum ativo na carteira ou watchlist" }, { status: 400 });

  const analyses = [];
  for (const id of ids.slice(0, 25)) {
    const { history, ...a } = await analyzeAsset(id);
    void history; // the chart series is not sent to the LLM
    analyses.push(a);
  }

  try {
    const out = await suggest(analyses, weightsBrl(positions));
    const byTicker = new Map(analyses.map((a, i) => [a.ticker, ids[i]]));
    const saved = [];
    for (const s of out) {
      const assetId = byTicker.get(s.ticker.toUpperCase());
      if (!assetId) continue;
      const a = analyses.find((x) => x.ticker === s.ticker.toUpperCase());
      saved.push(
        await db.suggestion.create({
          data: {
            assetId,
            action: s.acao,
            confidence: s.confianca,
            targetPrice: s.preco_alvo,
            rationale: s.justificativa,
            risks: JSON.stringify(s.riscos ?? []),
            indicators: JSON.stringify(a ?? {}),
            model: geminiModel(),
          },
          include: { asset: true },
        }),
      );
    }
    return NextResponse.json({ suggestions: saved, analyses });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, analyses }, { status: 502 });
  }
}
