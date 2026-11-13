import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";

// The Accounting tab's "Needs review" box (see src/lib/plaid-sync.ts):
//   { action: "move", targetId } — an edited pending charge vanished with no
//       posted replacement linked to it: copy its edits onto the posted charge
//       the user picked (filling only fields still empty there), move its
//       notes thread there too, then remove it.
//   { action: "dismiss" } — it was declined/reversed: remove it and its notes.
//   { action: "ok" } — edits carried over but the amount changed: looked at,
//       clear the flag.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) {
  if (!isFeatureEnabled("accounting")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { transactionId: id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; targetId?: unknown };
  const action = body.action;
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  if (action !== "move" && action !== "dismiss" && action !== "ok") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (action === "move" && !targetId) {
    return NextResponse.json({ error: "Pick the transaction to move the edits to." }, { status: 400 });
  }

  try {
    await ensurePlaidAnnotationColumns(prisma);
    let n = 0;
    if (action === "ok") {
      n = await prisma.$executeRaw(Prisma.sql`
        UPDATE plaid_transactions SET review_reason = NULL, review_detail = NULL
        WHERE transaction_id = ${id} AND review_reason = 'amount_changed'`);
    } else if (action === "dismiss") {
      n = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM plaid_transactions WHERE transaction_id = ${id} AND review_reason = 'pending_dropped'`);
      // Its notes thread goes with it (only once the charge itself is gone).
      if (n > 0) {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_notes WHERE transaction_id = ${id}`);
        await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_splits WHERE transaction_id = ${id}`);
      }
    } else {
      const [copied] = await prisma.$transaction([
        prisma.$executeRaw(Prisma.sql`
          UPDATE plaid_transactions t SET
            reimbursable = COALESCE(t.reimbursable, p.reimbursable),
            category_override = COALESCE(NULLIF(t.category_override, ''), p.category_override),
            recorded_quickbooks = t.recorded_quickbooks OR p.recorded_quickbooks,
            recorded_rentvine = t.recorded_rentvine OR p.recorded_rentvine,
            notes = COALESCE(NULLIF(t.notes, ''), p.notes),
            property_external_id = COALESCE(t.property_external_id, p.property_external_id),
            unit_external_id = CASE WHEN t.property_external_id IS NULL THEN p.unit_external_id ELSE t.unit_external_id END,
            annotated_at = now(),
            annotated_by = ${user?.email ?? "operator"}
          FROM plaid_transactions p
          WHERE t.transaction_id = ${targetId} AND t.pending = false
            AND p.transaction_id = ${id} AND p.review_reason = 'pending_dropped'`),
        // Split lines move to the chosen charge (unless it has its own)…
        prisma.$executeRaw(Prisma.sql`
          UPDATE transaction_splits SET transaction_id = ${targetId}, updated_at = now()
          WHERE transaction_id = ${id}
            AND NOT EXISTS (SELECT 1 FROM transaction_splits WHERE transaction_id = ${targetId})
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${id} AND review_reason = 'pending_dropped')
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${targetId} AND pending = false)`),
        // …and the notes thread moves there too.
        prisma.$executeRaw(Prisma.sql`
          UPDATE transaction_notes SET transaction_id = ${targetId}
          WHERE transaction_id = ${id}
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${id} AND review_reason = 'pending_dropped')
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${targetId} AND pending = false)`),
        // Lines the chosen charge didn't take (it had its own) go with the row.
        prisma.$executeRaw(Prisma.sql`
          DELETE FROM transaction_splits WHERE transaction_id = ${id}
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${targetId} AND pending = false)`),
        prisma.$executeRaw(Prisma.sql`
          DELETE FROM plaid_transactions
          WHERE transaction_id = ${id} AND review_reason = 'pending_dropped'
            AND EXISTS (SELECT 1 FROM plaid_transactions WHERE transaction_id = ${targetId} AND pending = false)`),
      ]);
      n = copied;
    }
    if (n === 0) return NextResponse.json({ error: "Nothing to review for that transaction." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[plaid] review ${String(action)} failed for ${id}:`, e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
