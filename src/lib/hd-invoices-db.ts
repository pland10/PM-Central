import { Prisma, type PrismaClient } from "@prisma/client";
import { ensurePlaidTables } from "@/lib/plaid-sync";
import { HD_ACCOUNT_NAME, hdTransactionId, type HdInvoice } from "@/lib/hd-invoices";

// Save Home Depot Pro invoices into plaid_transactions — shared by the
// Accounting page's Import button (/api/plaid/import-hd) and the daily Citi
// download (scripts/sync-hd-invoices.ts). One row per invoice, keyed
// hd:<invoice number>, so re-importing updates instead of duplicating. Like
// the Plaid sync, the upsert only refreshes the invoice's own fields, never
// the team's annotations (property, reimbursable, recorded, notes, archive).

const HD_ITEM_ID = "home-depot-pro"; // not a Plaid item; groups the imported rows

export async function upsertHdInvoices(
  prisma: PrismaClient,
  invoices: HdInvoice[]
): Promise<{ imported: number; updated: number }> {
  // One row per invoice (a repeated line would make the upsert hit the same
  // row twice, which Postgres rejects).
  const rows = [...new Map(invoices.map((r) => [r.invoiceNumber, r])).values()];
  if (rows.length === 0) return { imported: 0, updated: 0 };

  await ensurePlaidTables(prisma);
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
  return { imported, updated: result.length - imported };
}
