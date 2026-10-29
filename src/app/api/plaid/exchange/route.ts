import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { isPlaidConfigured, plaidPost } from "@/lib/plaid";

// Exchanges the public_token from a completed Plaid Link flow for a long-lived
// access_token and stores the linked item in plaid_items, so the daily sync can
// pull its transactions. Gated by the accounting feature + Plaid config; the
// app's middleware already requires auth.
export const dynamic = "force-dynamic";

const ENSURE_ITEMS = Prisma.sql`CREATE TABLE IF NOT EXISTS plaid_items (
  item_id TEXT PRIMARY KEY, access_token TEXT NOT NULL, institution_id TEXT,
  institution_name TEXT, label TEXT, cursor TEXT, status TEXT DEFAULT 'active',
  last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`;

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
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
    await prisma.$executeRaw(ENSURE_ITEMS);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO plaid_items (item_id, access_token, institution_id, institution_name, status, created_at)
      VALUES (${ex.item_id}, ${ex.access_token}, ${body.institution?.institution_id ?? null},
              ${body.institution?.name ?? null}, 'active', now())
      ON CONFLICT (item_id) DO UPDATE
        SET access_token = EXCLUDED.access_token,
            institution_name = EXCLUDED.institution_name,
            status = 'active'`);
    return NextResponse.json({ ok: true, item_id: ex.item_id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Plaid request failed." },
      { status: 502 }
    );
  }
}
