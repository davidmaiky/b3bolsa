import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeAsset } from "@/lib/analysis";
import { geminiConfigured, suggest } from "@/lib/llm/gemini";
import { AllModelsFailed } from "@/lib/llm/fallback";
import type { Profile } from "@/lib/profile";
import { loadPositions, weightsBrl } from "@/lib/server-portfolio";
import { priceService } from "@/lib/prices";
import { yahooQuotes } from "@/lib/yahoo";

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
  const positions = await loadPositions();
  // USD positions need the USD/BRL rate: without it the weights sent to the AI would be wrong
  let fx = priceService.quotes.get("USD:FX")?.price;
  if (positions.some((p) => p.quantity > 0 && p.currency === "USD")) {
    fx = (await priceService.waitFor("USD:FX", 8_000))?.price ?? (await yahooQuotes(["BRL=X"]).catch(() => []))[0]?.price;
    if (!fx) return NextResponse.json({ error: "Cotação USD/BRL indisponível agora: tente de novo em instantes" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { assetIds?: string[] };
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
    const ctx = weightsBrl(positions, fx);
    const targets = await db.allocationTarget.findMany();
    let classAllocation: { classe: string; atual_pct: number; meta_pct: number }[] | undefined;
    if (targets.length && ctx.totalBrl > 0) {
      const byClass: Record<string, number> = {};
      for (const p of positions) {
        if (p.quantity <= 0) continue;
        const px = priceService.quotes.get(p.quoteKey)?.price ?? p.avgPrice;
        byClass[p.assetClass] = (byClass[p.assetClass] ?? 0) + px * p.quantity * (p.currency === "USD" ? fx ?? 0 : 1);
      }
      const t = Object.fromEntries(targets.map((x) => [x.assetClass, x.percent]));
      classAllocation = [...new Set([...Object.keys(byClass), ...Object.keys(t)])].map((c) => ({ classe: c, atual_pct: ((byClass[c] ?? 0) / ctx.totalBrl) * 100, meta_pct: t[c] ?? 0 }));
    }
    const profile = (await db.investorProfile.findUnique({ where: { id: "me" } })) as Profile | null;
    const { items: out, model, attempts } = await suggest(analyses, { ...ctx, classAllocation, profile });
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
            model,
          },
          include: { asset: true },
        }),
      );
    }
    return NextResponse.json({ suggestions: saved, analyses, model, fallbackAttempts: attempts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, attempts: e instanceof AllModelsFailed ? e.attempts : undefined }, { status: 502 });
  }
}
