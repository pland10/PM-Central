import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runTextAlerts } from "@/lib/text-alerts";
import { liveTextAlertDeps, textAlertConfig } from "@/lib/text-alerts-live";

// Vercel Cron, every 5 minutes: email an alert for each new outbound
// LeadSimple text (see src/lib/text-alerts.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!textAlertConfig().apiKey) {
    return NextResponse.json({ ok: false, skipped: "LEADSIMPLE_API_KEY not set" });
  }
  try {
    const result = await runTextAlerts(liveTextAlertDeps());
    console.log(`[text-alerts] ${JSON.stringify(result)}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Text alerts failed";
    console.error(`[text-alerts] ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
