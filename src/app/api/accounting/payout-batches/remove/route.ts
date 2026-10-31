import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { removeBatchItem } from "@/lib/payout-batches";

// Pull one payment back out of its batch (undo a mistake). Returns the removed
// item so the UI can tell the user to move that amount back from Operating →
// Trust. Gated by the accounting feature + the per-user accounting entitlement.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canAccessAccounting(await getCurrentUser())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { payoutId?: unknown };
  const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
  if (!payoutId) {
    return NextResponse.json({ error: "Missing payoutId." }, { status: 400 });
  }

  try {
    const result = await removeBatchItem(prisma, payoutId);
    if (!result.removed) {
      return NextResponse.json({ error: "That payment isn't in a batch." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(`[payout-batches] remove failed:`, e);
    return NextResponse.json({ error: "Could not remove the payment." }, { status: 500 });
  }
}
