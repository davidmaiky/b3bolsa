import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alertService } from "@/lib/alert-service";
import { dueDays } from "@/lib/fixed-income-server";
import { rowLabel } from "@/lib/fixed-income";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Applications about to mature (or already matured) whose notice was not dismissed yet. Polled by the notification area. */
export async function GET() {
  void alertService.checkDue(); // sends the Telegram notice once, if it is time
  const limit = new Date(Date.now() + dueDays() * 86_400_000);
  const rows = await db.fixedIncome.findMany({ where: { redeemedAt: null, dueSeenAt: null, maturityDate: { lte: limit } }, orderBy: { maturityDate: "asc" } });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      label: rowLabel(r),
      issuer: r.issuer,
      principal: r.principal,
      maturityDate: r.maturityDate.toISOString().slice(0, 10),
      daysLeft: Math.ceil((+r.maturityDate - Date.now()) / 86_400_000),
    })),
  );
}
