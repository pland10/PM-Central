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
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions
      SET reimbursable = ${reimbursable ?? null}, annotated_at = now(), annotated_by = ${user?.email ?? "operator"}
      WHERE transaction_id = ANY(${ids})`);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    console.error(`[plaid] bulk reimbursable save failed for ${ids.length} rows:`, e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
