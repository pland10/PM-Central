import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { parseHdInvoicesCsv } from "@/lib/hd-invoices";
import { upsertHdInvoices } from "@/lib/hd-invoices-db";

// Import a Home Depot Pro "Invoices by Statement Date" CSV into Bank
// Transactions. The Home Depot Pro card (Citi) isn't on Plaid, so its charges
// come in this way. Each invoice is one row in plaid_transactions keyed
// hd:<invoice number> (see upsertHdInvoices), so re-importing an overlapping
// file updates instead of duplicating and never touches the team's edits. The
// same save runs daily from scripts/sync-hd-invoices.ts.
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { csv?: unknown };
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (csv.length > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  }
  if (!csv.trim()) {
    return NextResponse.json({ error: "No file content received." }, { status: 400 });
  }

  let parsed: ReturnType<typeof parseHdInvoicesCsv>;
  try {
    parsed = parseHdInvoicesCsv(csv);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that file." }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "No invoices found in that file.", errors: parsed.errors },
      { status: 400 }
    );
  }

  try {
    const { imported, updated } = await upsertHdInvoices(prisma, parsed.rows);
    return NextResponse.json({ ok: true, imported, updated, errors: parsed.errors });
  } catch (e) {
    console.error("[import-hd] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Import failed — nothing was saved." }, { status: 500 });
  }
}
