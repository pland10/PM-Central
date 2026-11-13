import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { checkAnnotationPatch } from "@/lib/annotation-checks";
import { sanitizeAnnotationPatch } from "@/lib/transactions-view";
import { updateSplitLine } from "@/lib/transaction-splits-db";

// Edit one split line's fields from the table (reimbursable, category,
// property/unit, recorded in QuickBooks / Rentvine) — the same checks as a row
// edit. A line's amount only changes in the split editor (PUT …/splits), so the
// lines always add up.
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string; lineId: string }> }
) {
  if (!isFeatureEnabled("accounting")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { transactionId, lineId: rawLine } = await params;
  const lineId = Number(rawLine);
  if (!Number.isInteger(lineId) || lineId <= 0) return NextResponse.json({ error: "Missing line." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if ("amount" in body) {
    return NextResponse.json({ error: "Change line amounts in the split editor." }, { status: 400 });
  }
  const { notes: _ignored, ...patch } = sanitizeAnnotationPatch(body);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update." }, { status: 400 });

  try {
    const checked = await checkAnnotationPatch(patch, user);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: checked.status });
    const found = await updateSplitLine(transactionId, lineId, checked.patch);
    if (!found) return NextResponse.json({ error: "Line not found." }, { status: 404 });
    return NextResponse.json({ ok: true, patch: checked.patch });
  } catch (e) {
    console.error(`[plaid] split line save failed for ${transactionId}#${lineId}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
