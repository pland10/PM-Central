import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronAuthorized } from "@/lib/cron-auth";
import { isFeatureEnabled } from "@/config/features";
import { claimDigestSend, getDigestRecipients, releaseDigestSend } from "@/lib/calendar/db";
import { isSummaryTime } from "@/lib/calendar/daily-summary";
import { appBaseUrl, sendDailySummary } from "@/lib/calendar/daily-summary-send";
import { todayInET } from "@/lib/calendar/today";

// Vercel Cron (10:00 and 11:00 UTC, weekdays): emails the daily summary at 6am
// Eastern on business days. Outside that hour it returns without touching the
// database (so Neon can stay asleep); the day is claimed first so it's sent once.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  if (!isFeatureEnabled("calendar") || !isSummaryTime(now)) {
    return NextResponse.json({ ok: true, sent: false, reason: "not 6am ET on a business day" });
  }
  const date = todayInET(now);
  try {
    const to = await getDigestRecipients(prisma);
    if (!to.length) return NextResponse.json({ ok: true, sent: false, reason: "no recipients" });
    if (!(await claimDigestSend(prisma, date))) return NextResponse.json({ ok: true, sent: false, reason: "already sent today" });
    const sent = await sendDailySummary(to, appBaseUrl(), now);
    if (!sent.ok) {
      await releaseDigestSend(prisma, date);
      console.error(`[daily-summary] send failed: ${sent.error}`);
      return NextResponse.json({ ok: false, sent: false, error: sent.error }, { status: 502 });
    }
    console.log(`[daily-summary] sent to ${to.length} recipient(s)`);
    return NextResponse.json({ ok: true, sent: true, count: to.length });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Daily summary failed";
    console.error(`[daily-summary] ${error}`);
    return NextResponse.json({ ok: false, sent: false, error }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
