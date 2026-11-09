import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import { sanitizeAnnotationPatch } from "@/lib/transactions-view";

// Bulk edit from the Transactions tab's multi-select: set the reimbursable flag
// on many transactions in one UPDATE. Same gating as the single-row PATCH
// (accounting feature + per-user accounting entitlement).
export const dynamic = "force-dynamic";

const MAX_IDS = 5000;

export async function PATCH(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  // "Archive all recorded": file away every posted transaction recorded in
  // QuickBooks AND either also in Rentvine or marked not reimbursable (the
  // not-reimbursable items are the ones that never go to Rentvine), in one
  // update (same eligibility as the single-row archive). Already-archived rows
  // are skipped so their original archived_at/by stamps are preserved. No id
  // list — it's a sweep.
  if (body && (body as { archiveAllRecorded?: unknown }).archiveAllRecorded === true) {
    try {
      await ensurePlaidAnnotationColumns(prisma);
      // RETURNING the ids so the page can offer Undo for exactly this batch.
      const rows = await prisma.$queryRaw<{ transaction_id: string }[]>(Prisma.sql`
        UPDATE plaid_transactions
        SET archived = true, archived_at = now(), archived_by = ${user?.email ?? "operator"}
        WHERE archived = false AND pending = false
          AND recorded_quickbooks = true
          AND (recorded_rentvine = true OR reimbursable = 'no')
        RETURNING transaction_id`);
      const ids = rows.map((r) => r.transaction_id);
      return NextResponse.json({ ok: true, archived: ids.length, ids });
    } catch (e) {
      console.error(`[plaid] bulk archive-all-recorded failed:`, e);
      return NextResponse.json({ error: "Could not archive." }, { status: 500 });
    }
  }

  // Undo of a bulk archive: put back exactly the rows that batch archived.
  if (body && Array.isArray((body as { unarchiveIds?: unknown }).unarchiveIds)) {
    const raw = (body as { unarchiveIds: unknown[] }).unarchiveIds;
    const ids = [...new Set(raw.filter((x): x is string => typeof x === "string" && x !== ""))];
    if (ids.length === 0 || raw.length > MAX_IDS) {
      return NextResponse.json({ error: `Send between 1 and ${MAX_IDS} transactions.` }, { status: 400 });
    }
    try {
      await ensurePlaidAnnotationColumns(prisma);
      const unarchived = await prisma.$executeRaw(Prisma.sql`
        UPDATE plaid_transactions
        SET archived = false, archived_at = NULL, archived_by = NULL
        WHERE transaction_id = ANY(${ids}) AND archived = true`);
      return NextResponse.json({ ok: true, unarchived });
    } catch (e) {
      console.error(`[plaid] bulk unarchive failed for ${ids.length} rows:`, e);
      return NextResponse.json({ error: "Could not undo." }, { status: 500 });
    }
  }

  const rawIds: unknown = body?.ids;
  if (!Array.isArray(rawIds) || !body || !("reimbursable" in body)) {
    return NextResponse.json({ error: "Send ids and reimbursable." }, { status: 400 });
  }
  const ids = [...new Set(rawIds.filter((x): x is string => typeof x === "string" && x !== ""))];
  if (ids.length === 0 || rawIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Select between 1 and ${MAX_IDS} transactions.` }, { status: 400 });
  }
  const { reimbursable } = sanitizeAnnotationPatch({ reimbursable: body.reimbursable });

  try {
    await ensurePlaidAnnotationColumns(prisma);
    // Skip pending transactions — they get a new id when they post, so an
    // annotation would be orphaned (matches the single-row PATCH + the UI).
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions
      SET reimbursable = ${reimbursable ?? null}, annotated_at = now(), annotated_by = ${user?.email ?? "operator"}
      WHERE transaction_id = ANY(${ids}) AND pending = false`);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    console.error(`[plaid] bulk reimbursable save failed for ${ids.length} rows:`, e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
