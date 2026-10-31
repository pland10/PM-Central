import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { createPayoutBatch, type BatchItemInput } from "@/lib/payout-batches";

// Lock a batch of management-company trust draws (the selected payments the
// user will move from trust → operating at the bank). Records the batch only;
// no money moves and nothing is written back to Rentvine. Gated by the
// accounting feature + the per-user accounting entitlement.
export const dynamic = "force-dynamic";

// Keep only well-formed items (a non-empty payoutId + a finite amount).
function sanitizeItems(raw: unknown): BatchItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: BatchItemInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const payoutId = typeof o.payoutId === "string" ? o.payoutId.trim() : "";
    if (!payoutId) continue;
    const amount = Number(o.amount);
    out.push({
      payoutId,
      amount: Number.isFinite(amount) ? amount : 0,
      payee: typeof o.payee === "string" ? o.payee.slice(0, 200) : undefined,
      bankAccount: typeof o.bankAccount === "string" ? o.bankAccount.slice(0, 120) : undefined,
      postedDate: typeof o.postedDate === "string" ? o.postedDate.slice(0, 10) : undefined,
      memo: typeof o.memo === "string" ? o.memo.slice(0, 500) : undefined,
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { items?: unknown; note?: unknown };
  const items = sanitizeItems(body.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "Select at least one payment to batch." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  try {
    const result = await createPayoutBatch(prisma, items, { note, by: user?.email ?? "operator" });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Those payments were already batched.", ...result },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(`[payout-batches] create failed:`, e);
    return NextResponse.json({ error: "Could not lock the batch." }, { status: 500 });
  }
}
