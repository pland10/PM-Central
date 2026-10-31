import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { confirmPayoutBatch } from "@/lib/payout-batches";

// Confirm a batch's money actually moved at the bank — unlocks the screen.
// Gated by the accounting feature + the per-user accounting entitlement.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { batchId?: unknown };
  const batchId = Number(body.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "Missing batchId." }, { status: 400 });
  }

  try {
    const ok = await confirmPayoutBatch(prisma, batchId, user?.email ?? "operator");
    if (!ok) {
      return NextResponse.json({ error: "That batch is already confirmed or no longer exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, batchId });
  } catch (e) {
    console.error(`[payout-batches] confirm failed:`, e);
    return NextResponse.json({ error: "Could not confirm the batch." }, { status: 500 });
  }
}
