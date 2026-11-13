import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { OBJECTIVES, RISKS } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  risk: z.enum(RISKS),
  objective: z.enum(OBJECTIVES),
  horizonYears: z.number().int().min(1).max(60),
  maxPositionPct: z.number().min(1).max(100).nullable().default(null),
  notes: z.string().max(500).nullable().default(null),
});

export async function GET() {
  // {} (not null) when nothing is saved: an empty/null body breaks response.json() on the client
  return NextResponse.json((await db.investorProfile.findUnique({ where: { id: "me" } })) ?? {});
}

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = { ...parsed.data, notes: parsed.data.notes?.trim() || null };
  await db.investorProfile.upsert({ where: { id: "me" }, create: { id: "me", ...d }, update: d });
  return NextResponse.json({ ok: true });
}
