import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/config/features";

// Autocomplete for the Search "scope by" inputs — distinct contact / property /
// pipeline values matching what the user is typing. Server-side (keys stay off
// the client), mirrors the standalone app's fetchSuggestions.
export const dynamic = "force-dynamic";

const FIELDS = ["contact_names", "property_address", "pipeline_name"];

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("search")) return NextResponse.json({ items: [] }, { status: 404 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ items: [] }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const field = sp.get("field") || "";
  const val = (sp.get("q") || "").trim();
  if (!FIELDS.includes(field) || val.length < 2) return NextResponse.json({ items: [] });

  const { data, error } = await db
    .from("activities")
    .select(field)
    .ilike(field, `%${val}%`)
    .not(field, "is", null)
    .neq(field, "")
    .limit(50);
  if (error) return NextResponse.json({ items: [] });

  // Deduplicate and split multi-value fields (contact_names can be a CSV).
  const seen = new Set<string>();
  const items: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data as any[]) || []) {
    const raw = (row[field] || "") as string;
    for (const part of raw.split(",")) {
      const clean = part.trim();
      const lower = clean.toLowerCase();
      if (clean && lower.includes(val.toLowerCase()) && !seen.has(lower)) {
        seen.add(lower);
        items.push(clean);
      }
    }
  }
  items.sort();
  return NextResponse.json({ items: items.slice(0, 12) });
}
