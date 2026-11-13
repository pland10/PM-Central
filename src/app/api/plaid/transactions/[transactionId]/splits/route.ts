import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { checkAnnotationPatch } from "@/lib/annotation-checks";
import { sanitizeSplitLines } from "@/lib/transaction-splits";
import { chargeAmount, deleteSplits, replaceSplits } from "@/lib/transaction-splits-db";

// Split one bank/card charge into lines (Bank Transactions → Split):
//   PUT    { lines: [{ amount, propertyId?, unitId?, categoryOverride?,
//            reimbursable?, recordedQuickbooks?, recordedRentvine? }, …] }
//          → replace the charge's lines (must add up to the charge, to the cent)
//   DELETE → unsplit: drop the lines; returns the charge's own fields
// One line's fields (not its amount) are edited at …/splits/:lineId.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ transactionId: string }> };

async function gate() {
  if (!isFeatureEnabled("accounting")) return { deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return { deny: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { user };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { user, deny } = await gate();
  if (deny) return deny;
  const { transactionId } = await params;
  const body = (await req.json().catch(() => ({}))) as { lines?: unknown };

  try {
    const total = await chargeAmount(transactionId);
    if (total === null) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    const parsed = sanitizeSplitLines(body.lines, total);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Each line's category/property gets the same checks as a row edit.
    for (const line of parsed.lines) {
      const checked = await checkAnnotationPatch(
        { categoryOverride: line.categoryOverride, propertyId: line.propertyId, unitId: line.unitId },
        user ?? null
      );
      if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: checked.status });
      line.categoryOverride = checked.patch.categoryOverride ?? line.categoryOverride;
    }

    const lines = await replaceSplits(transactionId, parsed.lines);
    return NextResponse.json({ ok: true, lines });
  } catch (e) {
    console.error(`[plaid] split save failed for ${transactionId}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save the split." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { deny } = await gate();
  if (deny) return deny;
  const { transactionId } = await params;
  try {
    const header = await deleteSplits(transactionId);
    if (!header) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    return NextResponse.json({ ok: true, header });
  } catch (e) {
    console.error(`[plaid] unsplit failed for ${transactionId}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not unsplit." }, { status: 500 });
  }
}
