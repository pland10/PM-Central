import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import { sanitizeAnnotationPatch } from "@/lib/transactions-view";
import { resolveCategoryForSave } from "@/lib/transaction-categories-db";
import { unitBelongsToProperty } from "@/lib/rentvine-units";

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

  // Archive / unarchive is its own action, not a normal annotation edit. A row
  // can be archived once it's recorded in QuickBooks AND either also in Rentvine
  // or marked not reimbursable — the not-reimbursable items are the ones that
  // never go to Rentvine. Unarchiving (undoing a mistake) is always allowed.
  if (typeof (body as { archived?: unknown }).archived === "boolean") {
    const archived = (body as { archived: boolean }).archived;
    try {
      await ensurePlaidAnnotationColumns(prisma);
      if (archived) {
        const n = await prisma.$executeRaw(Prisma.sql`
          UPDATE plaid_transactions
          SET archived = true, archived_at = now(), archived_by = ${user?.email ?? "operator"}
          WHERE transaction_id = ${transactionId} AND pending = false
            AND recorded_quickbooks = true
            AND (recorded_rentvine = true OR reimbursable = 'no')`);
        if (n === 0) {
          return NextResponse.json(
            {
              error:
                "Only a transaction recorded in QuickBooks that's also in Rentvine or marked not reimbursable can be archived.",
            },
            { status: 409 }
          );
        }
      } else {
        const n = await prisma.$executeRaw(Prisma.sql`
          UPDATE plaid_transactions
          SET archived = false, archived_at = NULL, archived_by = NULL
          WHERE transaction_id = ${transactionId}`);
        if (n === 0) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, archived });
    } catch (e) {
      console.error(`[plaid] archive change failed for ${transactionId}:`, e);
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
  }

  const patch = sanitizeAnnotationPatch(body);

  // A typed category is checked against the shared list: look-alikes save under
  // the list's spelling, new ones are added while the list is open, and a locked
  // list refuses unknown ones (admins excepted).
  if (patch.categoryOverride) {
    try {
      const decision = await resolveCategoryForSave(patch.categoryOverride, {
        isAdmin: !user || user.role === "admin", // basic-auth operator = admin
        by: user?.email ?? "operator",
      });
      if ("error" in decision) return NextResponse.json({ error: decision.error }, { status: 400 });
      patch.categoryOverride = decision.name;
    } catch (e) {
      console.error(`[plaid] category check failed for ${transactionId}:`, e);
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
  }

  // Only an existing property can be linked (the page's typeahead offers just
  // those; this guards against stale or hand-crafted requests).
  // A unit always travels with its property: changing the property without a
  // unit clears the unit, and a unit must belong to that property.
  if (patch.propertyId !== undefined && patch.unitId === undefined) patch.unitId = null;
  if (patch.unitId && !patch.propertyId) {
    return NextResponse.json({ error: "Pick a property from the list." }, { status: 400 });
  }
  if (patch.propertyId) {
    const exists = await prisma.property.findFirst({ where: { externalId: patch.propertyId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Pick a property from the list." }, { status: 400 });
    if (patch.unitId && !(await unitBelongsToProperty(prisma, patch.unitId, patch.propertyId))) {
      return NextResponse.json({ error: "That unit isn't part of the property — pick from the list." }, { status: 400 });
    }
  }

  // Build the SET clause from exactly the fields the user changed.
  const sets: Prisma.Sql[] = [];
  if (patch.reimbursable !== undefined) sets.push(Prisma.sql`reimbursable = ${patch.reimbursable}`);
  if (patch.categoryOverride !== undefined) sets.push(Prisma.sql`category_override = ${patch.categoryOverride}`);
  if (patch.recordedQuickbooks !== undefined) sets.push(Prisma.sql`recorded_quickbooks = ${patch.recordedQuickbooks}`);
  if (patch.recordedRentvine !== undefined) sets.push(Prisma.sql`recorded_rentvine = ${patch.recordedRentvine}`);
  if (patch.notes !== undefined) sets.push(Prisma.sql`notes = ${patch.notes}`);
  if (patch.propertyId !== undefined) sets.push(Prisma.sql`property_external_id = ${patch.propertyId}`);
  if (patch.unitId !== undefined) sets.push(Prisma.sql`unit_external_id = ${patch.unitId}`);

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  sets.push(Prisma.sql`annotated_at = now()`);
  sets.push(Prisma.sql`annotated_by = ${user?.email ?? "operator"}`);

  try {
    await ensurePlaidAnnotationColumns(prisma);
    // Only posted transactions are editable: a pending one gets a new id when it
    // posts, so an annotation here would be orphaned. The UI disables the editors
    // on pending rows; this is the authoritative backstop.
    const updated = await prisma.$executeRaw(
      Prisma.sql`UPDATE plaid_transactions SET ${Prisma.join(sets)} WHERE transaction_id = ${transactionId} AND pending = false`
    );
    if (updated === 0) {
      return NextResponse.json(
        { error: "This transaction is still pending — you can edit it once it posts." },
        { status: 409 }
      );
    }
  } catch (e) {
    // Don't leak DB/driver internals to the browser; log the detail server-side.
    console.error(`[plaid] annotation save failed for ${transactionId}:`, e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, patch });
}
