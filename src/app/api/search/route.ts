import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/config/features";

// Native Search API — full-text search over the synced LeadSimple `activities`
// table in Supabase. Mirrors the standalone search app's query, but runs
// server-side so the keys never reach the browser. Behind PM-Central's auth.
export const dynamic = "force-dynamic";

const ALL_TYPES = ["email", "text", "call", "task"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, q: string, dir: string, taskStatus: string, types: string[]) {
  query = query.in("type", types);

  // Task open/closed — constrains tasks without excluding other selected types.
  if (types.includes("task") && (taskStatus === "open" || taskStatus === "closed")) {
    query =
      taskStatus === "open"
        ? query.or("type.neq.task,completed_at.is.null")
        : query.or("type.neq.task,completed_at.not.is.null");
  }

  // Direction — rows with no direction (notes, tasks, some calls) match either.
  if (dir === "inbound" || dir === "outbound") {
    query = query.or(`direction.eq.${dir},direction.is.null`);
  }

  if (q) {
    query = query.textSearch("search_vector", q, { config: "english", type: "websearch" });
  }
  return query;
}

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("search")) {
    return NextResponse.json({ error: "Search is disabled." }, { status: 404 });
  }
  const db = getSupabase();
  if (!db) {
    return NextResponse.json(
      { error: "Search is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY." },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const dir = sp.get("dir") || "";
  const taskStatus = sp.get("taskStatus") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));
  const types = (sp.get("types") || ALL_TYPES.join(","))
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALL_TYPES.includes(t));

  if (types.length === 0) {
    return NextResponse.json({ rows: [], count: 0, page, pageSize });
  }

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  const { data, error } = await applyFilters(db.from("activities").select("*"), q, dir, taskStatus, types)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // Total is a nicety fetched separately — a slow/failed count shouldn't block results.
  let count: number | null = null;
  const countRes = await applyFilters(
    db.from("activities").select("id", { count: "exact", head: true }),
    q,
    dir,
    taskStatus,
    types
  );
  if (!countRes.error) count = countRes.count ?? 0;

  return NextResponse.json({ rows: data ?? [], count, page, pageSize });
}
