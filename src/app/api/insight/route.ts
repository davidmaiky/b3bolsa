import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest overall reading of the portfolio written by the AI together with the suggestions ({} when none yet). */
export async function GET() {
  return NextResponse.json((await db.portfolioInsight.findFirst({ orderBy: { createdAt: "desc" } })) ?? {});
}
