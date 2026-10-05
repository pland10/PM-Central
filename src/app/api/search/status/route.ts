import { NextResponse } from "next/server";
import { syncStatusRows } from "@/lib/search-db";
import { isFeatureEnabled } from "@/config/features";

// Sync freshness for the Search header ("Updated N ago"). Reads the heartbeat
// the sync jobs write to Neon; reports the OLDEST job so it reads as
// "everything is at least this fresh", and flags a stuck backlog. Internal
// cursor rows (job names starting with "_") are already excluded by the query.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("search")) return NextResponse.json({}, { status: 404 });

  let rows;
  try {
    rows = await syncStatusRows();
  } catch {
    return NextResponse.json({});
  }
  if (!rows.length) return NextResponse.json({});

  const oldest = rows.reduce((a, b) =>
    new Date(a.last_run_at ?? 0) < new Date(b.last_run_at ?? 0) ? a : b
  );
  const stuck = rows.find((r) => /stuck/i.test(r.detail || ""));

  return NextResponse.json({
    updatedAt: oldest.last_run_at,
    stuck: !!stuck,
    detail: stuck ? String(stuck.detail || "") : "",
  });
}
