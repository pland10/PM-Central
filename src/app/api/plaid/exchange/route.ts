import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { isPlaidConfigured, plaidPost } from "@/lib/plaid";
import { ensurePlaidTables, syncOneItem } from "@/lib/plaid-sync";

// Exchanges the public_token from a completed Plaid Link flow for a long-lived
// access_token, stores the linked item in plaid_items, and kicks off an initial
// transaction sync so the account's transactions show up right away (rather than
// waiting for the next daily run). Gated by the accounting feature + Plaid
// config; the app's middleware already requires auth.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canAccessAccounting(await getCurrentUser())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Plaid isn't configured for this environment." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    public_token?: string;
    institution?: { name?: string; institution_id?: string } | null;
  };
  if (!body.public_token) {
    return NextResponse.json({ error: "Missing public_token." }, { status: 400 });
  }

  try {
    const ex = await plaidPost<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token: body.public_token }
    );

    await ensurePlaidTables(prisma);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO plaid_items (item_id, access_token, institution_id, institution_name, status, created_at)
      VALUES (${ex.item_id}, ${ex.access_token}, ${body.institution?.institution_id ?? null},
              ${body.institution?.name ?? null}, 'active', now())
      ON CONFLICT (item_id) DO UPDATE
        SET access_token = EXCLUDED.access_token,
            institution_name = EXCLUDED.institution_name,
            status = 'active'`);

    // Initial pull so transactions appear promptly. Best-effort: Plaid may still
    // be preparing the first batch (the daily sync will catch the rest), so a
    // hiccup here must not fail the connect.
    let synced = 0;
    try {
      const r = await syncOneItem(prisma, { itemId: ex.item_id, accessToken: ex.access_token, cursor: null });
      synced = r.upserted;
    } catch (e) {
      console.log(`[plaid] initial sync deferred for ${ex.item_id}: ${e instanceof Error ? e.message : e}`);
    }

    return NextResponse.json({ ok: true, item_id: ex.item_id, synced });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Plaid request failed." },
      { status: 502 }
    );
  }
}
