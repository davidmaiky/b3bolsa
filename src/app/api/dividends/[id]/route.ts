import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.dividend.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
