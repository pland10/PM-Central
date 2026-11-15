import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runPushAlerts } from "@/lib/push-alerts";
import { livePushAlertDeps } from "@/lib/push-alerts-live";

// Vercel Cron: push an alert to opted-in admins for each new returned/NSF
// payment and new/urgent work order (see src/lib/push-alerts.ts). Best-effort —
// a delivery failure never fails the run.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await runPushAlerts(livePushAlertDeps());
    console.log(`[push-alerts] ${JSON.stringify(result)}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Push alerts failed";
    console.error(`[push-alerts] ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
