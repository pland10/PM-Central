import { NextRequest, NextResponse } from "next/server";
import { DATA_SOURCES, getDataSource, type DataSource } from "@/config/data-sources";
import { dispatchSources } from "@/lib/dispatch";
import { cronAuthorized } from "@/lib/cron-auth";

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


async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) {
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
    // Skip self-scheduled sources (their own GitHub cron already runs them);
    // they stay refreshable by explicit ?source=<id>.
    targets = DATA_SOURCES.filter((s) => s.tier === tier && !s.selfScheduled);
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
