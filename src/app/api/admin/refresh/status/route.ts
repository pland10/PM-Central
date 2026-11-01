import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getDataSource } from "@/config/data-sources";
import { latestRunState } from "@/lib/dispatch";

// Admin-only: how is the refresh started at `since` doing? Polled by the
// Refresh button on the admin Data page (?source=<id>&since=<ISO time>).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const source = getDataSource(req.nextUrl.searchParams.get("source") ?? "");
  if (!source) return NextResponse.json({ error: "Unknown data source." }, { status: 400 });
  const since = new Date(req.nextUrl.searchParams.get("since") ?? "");
  if (Number.isNaN(since.getTime())) return NextResponse.json({ error: "Bad since time." }, { status: 400 });

  return NextResponse.json(await latestRunState(source, since));
}
