import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { cleanBankReference, setBatchReference } from "@/lib/payout-batches";

// Edit the bank's (Chase) transaction # on an already-confirmed batch.
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

  const body = (await req.json().catch(() => ({}))) as { batchId?: unknown; bankReference?: unknown };
  const batchId = Number(body.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "Missing batchId." }, { status: 400 });
  }
  const ref = cleanBankReference(body.bankReference);
  if (!ref.ok) return NextResponse.json({ error: ref.error }, { status: 400 });

  try {
    const ok = await setBatchReference(prisma, batchId, ref.value);
    if (!ok) {
      return NextResponse.json({ error: "That batch isn't confirmed yet or no longer exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, batchId, bankReference: ref.value ?? "" });
  } catch (e) {
    console.error(`[payout-batches] reference update failed:`, e);
    return NextResponse.json({ error: "Could not save the transaction #." }, { status: 500 });
  }
}
