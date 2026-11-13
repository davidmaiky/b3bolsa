import { NextResponse } from "next/server";
import { loadEvolution } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    return NextResponse.json(await loadEvolution(new URL(req.url).searchParams.get("refresh") === "1"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
