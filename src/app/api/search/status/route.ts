import { NextResponse } from "next/server";
import { syncStatusRows } from "@/lib/search-db";
import { isFeatureEnabled } from "@/config/features";

// Sync freshness for the Search header ("Last refreshed …"). Reads the
// heartbeats the communication syncs write to Neon and reports the OLDEST of
// them, so it reads as "everything here is at least this fresh"; flags a stuck
// backlog. Only the syncs that feed Search count — sync_status also holds daily
// Rentvine jobs, the weekly deep crawl and bookkeeping rows (e.g. the login
// alert), which would make the page look days stale. Jobs that have never run
// are skipped (a null time used to blank the badge).
export const dynamic = "force-dynamic";

const SEARCH_JOBS = new Set(["tasks", "activity_refresh", "rentvine_chat", "rent_settlements"]);

export async function GET() {
  if (!isFeatureEnabled("search")) return NextResponse.json({}, { status: 404 });

  let rows;
  try {
    rows = await syncStatusRows();
  } catch {
    return NextResponse.json({});
  }
  const comms = rows.filter((r) => SEARCH_JOBS.has(r.job) && r.last_run_at);
  if (!comms.length) return NextResponse.json({});

  const oldest = comms.reduce((a, b) => (new Date(a.last_run_at!) < new Date(b.last_run_at!) ? a : b));
  const stuck = comms.find((r) => /stuck/i.test(r.detail || ""));

  return NextResponse.json({
    updatedAt: oldest.last_run_at,
    stuck: !!stuck,
    detail: stuck ? String(stuck.detail || "") : "",
  });
}
