import { NextResponse } from "next/server";
import { loadPositions } from "@/lib/server-portfolio";
import { priceService } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const positions = await loadPositions();
  return NextResponse.json({ positions, quotes: priceService.snapshot() });
}
