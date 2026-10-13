import { NextResponse } from "next/server";
import { syncStatusForJob } from "@/lib/search-db";
import { isFeatureEnabled } from "@/config/features";

// Sync freshness for the Team Comms header ("Updated N ago"). Reads the
// `ringcentral_chat` heartbeat the RingCentral chat sync writes to Neon.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("teamComms")) return NextResponse.json({}, { status: 404 });

  let row;
  try {
    row = await syncStatusForJob("ringcentral_chat");
  } catch {
    return NextResponse.json({});
  }
  if (!row) return NextResponse.json({});

  const stuck = /stuck/i.test(row.detail || "");
  return NextResponse.json({
    updatedAt: row.last_run_at,
    stuck,
    detail: stuck ? String(row.detail || "") : "",
  });
}
