import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import { sanitizeAnnotationPatch } from "@/lib/transactions-view";

// Saves the hand-entered annotations on one transaction (reimbursable?, your
// own category, recorded in QuickBooks / Rentvine, notes) from the Transactions
// tab. These columns live on plaid_transactions but the daily sync never writes
// them, so an edit survives re-syncing. Gated by the accounting feature + the
// per-user accounting entitlement (the app's middleware already requires auth).
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { transactionId } = await params;
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transaction id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const patch = sanitizeAnnotationPatch(body);

  // Build the SET clause from exactly the fields the user changed.
  const sets: Prisma.Sql[] = [];
  if (patch.reimbursable !== undefined) sets.push(Prisma.sql`reimbursable = ${patch.reimbursable}`);
  if (patch.categoryOverride !== undefined) sets.push(Prisma.sql`category_override = ${patch.categoryOverride}`);
  if (patch.recordedQuickbooks !== undefined) sets.push(Prisma.sql`recorded_quickbooks = ${patch.recordedQuickbooks}`);
  if (patch.recordedRentvine !== undefined) sets.push(Prisma.sql`recorded_rentvine = ${patch.recordedRentvine}`);
  if (patch.notes !== undefined) sets.push(Prisma.sql`notes = ${patch.notes}`);

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  sets.push(Prisma.sql`annotated_at = now()`);
  sets.push(Prisma.sql`annotated_by = ${user?.email ?? "operator"}`);

  try {
    await ensurePlaidAnnotationColumns(prisma);
    await prisma.$executeRaw(
      Prisma.sql`UPDATE plaid_transactions SET ${Prisma.join(sets)} WHERE transaction_id = ${transactionId}`
    );
  } catch (e) {
    // Don't leak DB/driver internals to the browser; log the detail server-side.
    console.error(`[plaid] annotation save failed for ${transactionId}:`, e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, patch });
}
