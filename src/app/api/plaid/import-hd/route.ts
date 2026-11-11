import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { ensurePlaidTables } from "@/lib/plaid-sync";
import { HD_ACCOUNT_NAME, hdTransactionId, parseHdInvoicesCsv } from "@/lib/hd-invoices";

// Import a Home Depot Pro "Invoices by Statement Date" CSV into Bank
// Transactions. The Home Depot Pro card (Citi) isn't on Plaid, so its charges
// come in this way. Each invoice is one row in plaid_transactions keyed
// hd:<invoice number>, so re-importing an overlapping file updates instead of
// duplicating — and, like the Plaid sync, the upsert only refreshes the
// invoice's own fields, never the team's annotations (property, reimbursable,
// recorded, notes, archive).
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;
const HD_ITEM_ID = "home-depot-pro"; // not a Plaid item; groups the imported rows

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
    await ensurePlaidTables(prisma);
    // One row per invoice (a repeated line would make the upsert hit the same
    // row twice, which Postgres rejects).
    const rows = [...new Map(parsed.rows.map((r) => [r.invoiceNumber, r])).values()];
    const values = rows.map(
      (r) => Prisma.sql`(${hdTransactionId(r.invoiceNumber)}, ${HD_ITEM_ID}, ${HD_ITEM_ID}, ${HD_ACCOUNT_NAME},
        ${r.po ? `Invoice ${r.invoiceNumber} · PO ${r.po}` : `Invoice ${r.invoiceNumber}`},
        ${"The Home Depot"}, ${r.amount}, ${"USD"}, ${r.date}::date, ${r.date}::date,
        ${"HOME_IMPROVEMENT"}, ${"in store"}, false, now())`
    );
    const result = await prisma.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
      INSERT INTO plaid_transactions (transaction_id, item_id, account_id, account_name, name,
        merchant_name, amount, iso_currency_code, posted_date, authorized_date, category,
        payment_channel, pending, synced_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (transaction_id) DO UPDATE SET
        account_name = EXCLUDED.account_name, name = EXCLUDED.name,
        merchant_name = EXCLUDED.merchant_name, amount = EXCLUDED.amount,
        posted_date = EXCLUDED.posted_date, authorized_date = EXCLUDED.authorized_date,
        synced_at = now()
      RETURNING (xmax = 0) AS inserted`);
    const imported = result.filter((r) => r.inserted).length;
    return NextResponse.json({ ok: true, imported, updated: result.length - imported, errors: parsed.errors });
  } catch (e) {
    console.error("[import-hd] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Import failed — nothing was saved." }, { status: 500 });
  }
}
