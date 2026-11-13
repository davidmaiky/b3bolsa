import { NextResponse } from "next/server";
import { lseHub } from "@/lib/lse/stream";
import { lseKey } from "@/lib/lse/rest";
import { geminiConfigured, geminiModel } from "@/lib/llm/gemini";
import { priceService } from "@/lib/prices";
import { authEnabled } from "@/lib/auth";
import { telegramConfigured } from "@/lib/alert-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    lseConfigured: !!lseKey(),
    geminiConfigured: geminiConfigured(),
    geminiModel: geminiModel(),
    sockets: lseHub.status(),
    authEnabled: authEnabled(),
    telegramConfigured: telegramConfigured(),
    yahooError: priceService.lastPollError ?? null,
  });
}
