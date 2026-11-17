import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { getDigestRecipients } from "@/lib/calendar/db";
import { sendDailySummary } from "@/lib/calendar/daily-summary-send";
import { calendarOff, notFound } from "@/lib/calendar/api";

// "Send now": email today's summary to the saved recipients right away (doesn't
// affect the 6am send). Admin only.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const to = await getDigestRecipients(prisma);
    if (!to.length) return NextResponse.json({ error: "Add at least one email address first." }, { status: 400 });
    const sent = await sendDailySummary(to, req.nextUrl.origin);
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
    return NextResponse.json({ ok: true, sentTo: to });
  } catch (e) {
    console.error("[calendar] send-now failed:", e);
    return NextResponse.json({ error: "Could not send the summary." }, { status: 500 });
  }
}
