import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { runTenantTurnerSync } from "@/lib/tenantturner/sync";
import { liveTenantTurnerDeps } from "@/lib/tenantturner/sync-live";

// Vercel Cron: pull Tenant Turner showings changed since the last run into the
// Showing table (see src/lib/tenantturner/sync.ts). Every 15 minutes by day
// (?slot=day), once overnight (?slot=night); the slot is only for the schedule.
// Logs counts only — never lead details.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.TENANT_TURNER_API_KEY) {
    return NextResponse.json({ ok: false, skipped: "TENANT_TURNER_API_KEY not set" });
  }
  try {
    const result = await runTenantTurnerSync(liveTenantTurnerDeps(prisma));
    console.log(`[tenantturner] ${JSON.stringify(result)}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Tenant Turner sync failed";
    console.error(`[tenantturner] ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
