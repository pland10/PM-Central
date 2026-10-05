import { NextRequest, NextResponse } from "next/server";
import { suggestValues, SUGGEST_FIELDS } from "@/lib/search-db";
import { isFeatureEnabled } from "@/config/features";

// Autocomplete for the Search "scope by" inputs — distinct contact / property /
// pipeline values matching what the user is typing. Server-side, reads the
// synced `activities` feed on Neon (Phase 3).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("search")) return NextResponse.json({ items: [] }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const field = sp.get("field") || "";
  const val = (sp.get("q") || "").trim();
  if (!SUGGEST_FIELDS.includes(field) || val.length < 2) {
    return NextResponse.json({ items: [] });
  }

  let raw: string[];
  try {
    raw = await suggestValues(field, val);
  } catch {
    return NextResponse.json({ items: [] });
  }

  // Deduplicate and split multi-value fields (contact_names can be a CSV).
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of raw) {
    for (const part of value.split(",")) {
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
