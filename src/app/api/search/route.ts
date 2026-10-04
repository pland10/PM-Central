import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/config/features";

// Native Search API — full-text search over the synced LeadSimple `activities`
// table in Supabase. Mirrors the standalone search app's query, but runs
// server-side so the keys never reach the browser. Behind PM-Central's auth.
export const dynamic = "force-dynamic";

const ALL_TYPES = ["email", "text", "call", "note", "chat", "task"];

type Filters = {
  q: string;
  dir: string;
  taskStatus: string;
  types: string[];
  contact: string;
  property: string;
  pipeline: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, f: Filters) {
  query = query.in("type", f.types);

  // Task open/closed — constrains tasks without excluding other selected types.
  if (f.types.includes("task") && (f.taskStatus === "open" || f.taskStatus === "closed")) {
    query =
      f.taskStatus === "open"
        ? query.or("type.neq.task,completed_at.is.null")
        : query.or("type.neq.task,completed_at.not.is.null");
  }

  // Scope: contact/property match either (OR); pipeline is ANDed on top.
  // Values are interpolated into a PostgREST filter string, so strip the
  // characters that could break out of it (comma, parens, star, backslash).
  const safe = (s: string) => s.replace(/[,()*\\]/g, " ").trim();
  const orParts: string[] = [];
  if (f.contact) orParts.push(`contact_names.ilike.%${safe(f.contact)}%`);
  if (f.property) orParts.push(`property_address.ilike.%${safe(f.property)}%`);
  if (orParts.length) query = query.or(orParts.join(","));
  if (f.pipeline) query = query.ilike("pipeline_name", `%${safe(f.pipeline)}%`);

  // Direction — rows with no direction (notes, tasks, some calls) match either.
  if (f.dir === "inbound" || f.dir === "outbound") {
    query = query.or(`direction.eq.${f.dir},direction.is.null`);
  }

  if (f.q) {
    query = query.textSearch("search_vector", f.q, { config: "english", type: "websearch" });
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
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));
  const types = (sp.get("types") || ALL_TYPES.join(","))
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALL_TYPES.includes(t));

  const f: Filters = {
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

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  const { data, error } = await applyFilters(db.from("activities").select("*"), f)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // Total is a nicety fetched separately — a slow/failed count shouldn't block results.
  let count: number | null = null;
  const countRes = await applyFilters(db.from("activities").select("id", { count: "exact", head: true }), f);
  if (!countRes.error) count = countRes.count ?? 0;

  return NextResponse.json({ rows: data ?? [], count, page, pageSize });
}
