import { NextRequest, NextResponse } from "next/server";
import { searchActivities, countActivities, type SearchFilters } from "@/lib/search-db";
import { isFeatureEnabled } from "@/config/features";

// Native Search API — full-text search over the synced `activities` feed, now
// on the single Neon DB (Phase 3). Runs server-side behind PM-Central's auth.
export const dynamic = "force-dynamic";

const ALL_TYPES = ["email", "text", "call", "note", "chat", "task", "payment"];

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("search")) {
    return NextResponse.json({ error: "Search is disabled." }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));
  const types = (sp.get("types") || ALL_TYPES.join(","))
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALL_TYPES.includes(t));

  const f: SearchFilters = {
    q: (sp.get("q") || "").trim(),
    dir: sp.get("dir") || "",
    taskStatus: sp.get("taskStatus") || "",
    types,
    contact: (sp.get("contact") || "").trim(),
    property: (sp.get("property") || "").trim(),
    pipeline: (sp.get("pipeline") || "").trim(),
  };

  if (types.length === 0) {
    return NextResponse.json({ rows: [], count: 0, page, pageSize });
  }

  const offset = (page - 1) * pageSize;

  try {
    const rows = await searchActivities(f, offset, pageSize);

    // Total is a nicety fetched separately — a slow/failed count shouldn't
    // block results.
    let count: number | null = null;
    try {
      count = await countActivities(f);
    } catch {
      /* ignore */
    }

    return NextResponse.json({ rows, count, page, pageSize });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed." },
      { status: 502 }
    );
  }
}
