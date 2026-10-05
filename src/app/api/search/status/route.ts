import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/config/features";

// Sync freshness for the Search header ("Updated N ago"). Reads the heartbeat
// the LeadSimple sync jobs write; reports the OLDEST job so it reads as
// "everything is at least this fresh", and flags a stuck backlog.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("search")) return NextResponse.json({}, { status: 404 });
  const db = getSupabase();
  if (!db) return NextResponse.json({});

  const { data, error } = await db.from("sync_status").select("job,last_run_at,detail");
  if (error || !data || !data.length) return NextResponse.json({});

  // Ignore internal bookkeeping rows (the sync cursors, whose job names start
  // with "_"). They aren't real heartbeats, and their detail JSON contains
  // "stuck_since", which would otherwise false-match the stuck check below and
  // leak raw state into the header.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]).filter((r) => r.job && !String(r.job).startsWith("_"));
  if (!rows.length) return NextResponse.json({});

  const oldest = rows.reduce((a, b) =>
    new Date(a.last_run_at) < new Date(b.last_run_at) ? a : b
  );
  const stuck = rows.find((r) => /stuck/i.test(r.detail || ""));

  return NextResponse.json({
    updatedAt: oldest.last_run_at,
    stuck: !!stuck,
    detail: stuck ? String(stuck.detail || "") : "",
  });
}
