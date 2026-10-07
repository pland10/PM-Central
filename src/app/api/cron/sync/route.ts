import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { DATA_SOURCES, getDataSource, type DataSource } from "@/config/data-sources";
import { dispatchSources } from "@/lib/dispatch";

// External-scheduler entry point. A reliable managed scheduler (e.g. Upstash
// QStash or cron-job.org) calls this on a schedule instead of relying on
// GitHub Actions' best-effort cron, which drops runs. It dispatches the due
// data sources' workflows. See DEPLOY.md → "Scheduling syncs".
//
//   POST/GET /api/cron/sync?tier=hourly     -> all hourly sources
//   POST/GET /api/cron/sync?tier=daily      -> all daily sources
//   POST/GET /api/cron/sync?source=balances -> one specific source
//
// Auth: Authorization: Bearer <CRON_SECRET>  (or ?key=<CRON_SECRET> for simple
// pingers that can't send headers). Runs on the Node runtime for crypto.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured => locked down
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = bearer || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const sourceId = params.get("source");
  const tier = params.get("tier");

  let targets: DataSource[];
  if (sourceId) {
    const s = getDataSource(sourceId);
    if (!s) return NextResponse.json({ error: `Unknown source "${sourceId}".` }, { status: 400 });
    targets = [s];
  } else if (tier === "hourly" || tier === "daily") {
    targets = DATA_SOURCES.filter((s) => s.tier === tier);
  } else {
    return NextResponse.json(
      { error: "Specify ?source=<id> or ?tier=hourly|daily." },
      { status: 400 }
    );
  }

  const dispatched = await dispatchSources(targets);
  const ok = dispatched.every((r) => r.ok);
  return NextResponse.json({ ok, dispatched }, { status: ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
