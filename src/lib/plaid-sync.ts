import { Prisma, type PrismaClient } from "@prisma/client";
import { syncTransactions, normalizeTransaction, plaidPost } from "./plaid";

// Shared Plaid → Neon sync logic, used by both the daily job
// (scripts/sync-plaid.ts) and the Connect flow (/api/plaid/exchange, which runs
// an initial sync right after linking so transactions show up promptly instead
// of waiting for the next daily run).

const DDL: Prisma.Sql[] = [
  Prisma.sql`CREATE TABLE IF NOT EXISTS plaid_items (
    item_id TEXT PRIMARY KEY, access_token TEXT NOT NULL, institution_id TEXT,
    institution_name TEXT, label TEXT, cursor TEXT, status TEXT DEFAULT 'active',
    last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
  Prisma.sql`CREATE TABLE IF NOT EXISTS plaid_transactions (
    transaction_id TEXT PRIMARY KEY, item_id TEXT, account_id TEXT, account_name TEXT,
    name TEXT, merchant_name TEXT, amount NUMERIC(14,2), iso_currency_code TEXT,
    posted_date DATE, authorized_date DATE, category TEXT, category_detail TEXT,
    payment_channel TEXT, pending BOOLEAN DEFAULT false, synced_at TIMESTAMPTZ DEFAULT now())`,
  Prisma.sql`CREATE INDEX IF NOT EXISTS plaid_transactions_posted_date_idx ON plaid_transactions (posted_date DESC)`,
  Prisma.sql`CREATE INDEX IF NOT EXISTS plaid_transactions_item_id_idx ON plaid_transactions (item_id)`,
];

// Hand-entered annotation columns on plaid_transactions (editable from the
// Transactions tab: reimbursable?, your own category, recorded in QuickBooks /
// Rentvine, notes). Kept out of the CREATE above because the sync never writes
// them — the upsert's ON CONFLICT only SETs Plaid-owned columns, so a re-sync
// never clobbers an edit. Additive + idempotent; documented in
// prisma/sql/plaid.sql so they can be pre-applied (db-change skill, Pattern B).
const ANNOTATION_DDL = [
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS reimbursable TEXT`, // 'yes' | 'no' | null
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS category_override TEXT`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS recorded_quickbooks BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS recorded_rentvine BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS annotated_at TIMESTAMPTZ`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS annotated_by TEXT`,
];

// Lazy ensure-guard (db-change skill, Pattern B): run the additive ALTERs once
// per process, before the first read/write/sync that depends on the columns.
// Statements are static (no user input), so $executeRawUnsafe is safe here.
let annotationColumns: Promise<void> | null = null;
export function ensurePlaidAnnotationColumns(prisma: PrismaClient): Promise<void> {
  if (!annotationColumns) {
    annotationColumns = (async () => {
      for (const stmt of ANNOTATION_DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      annotationColumns = null; // let a later call retry
      throw e;
    });
  }
  return annotationColumns;
}

export async function ensurePlaidTables(prisma: PrismaClient): Promise<void> {
  for (const stmt of DDL) await prisma.$executeRaw(stmt);
  await ensurePlaidAnnotationColumns(prisma);
}

async function accountNames(accessToken: string): Promise<Record<string, string>> {
  try {
    const { accounts } = await plaidPost<{
      accounts: { account_id: string; name?: string; official_name?: string }[];
    }>("/accounts/get", { access_token: accessToken });
    return Object.fromEntries(
      (accounts || []).map((a) => [a.account_id, a.official_name || a.name || a.account_id])
    );
  } catch {
    return {};
  }
}

export type ItemToSync = { itemId: string; accessToken: string; cursor?: string | null };

// Pull new/updated/removed transactions for one linked item and upsert them,
// then persist the new cursor. Idempotent (keyed on transaction_id). Assumes the
// tables exist — call ensurePlaidTables first.
export async function syncOneItem(
  prisma: PrismaClient,
  item: ItemToSync
): Promise<{ upserted: number; removed: number; cursor: string }> {
  const result = await syncTransactions(item.accessToken, item.cursor || "");
  const names = await accountNames(item.accessToken);
  const rows = [...result.added, ...result.modified].map((t) => normalizeTransaction(t, names));

  let upserted = 0;
  for (const r of rows) {
    if (!r.transactionId) continue;
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO plaid_transactions (transaction_id, item_id, account_id, account_name, name,
        merchant_name, amount, iso_currency_code, posted_date, authorized_date, category,
        category_detail, payment_channel, pending, synced_at)
      VALUES (${r.transactionId}, ${item.itemId}, ${r.accountId}, ${r.accountName}, ${r.name},
        ${r.merchantName}, ${r.amount}, ${r.isoCurrencyCode},
        ${r.postedDate}::date, ${r.authorizedDate}::date, ${r.category}, ${r.categoryDetail},
        ${r.paymentChannel}, ${r.pending}, now())
      ON CONFLICT (transaction_id) DO UPDATE SET
        account_name = EXCLUDED.account_name, name = EXCLUDED.name,
        merchant_name = EXCLUDED.merchant_name, amount = EXCLUDED.amount,
        posted_date = EXCLUDED.posted_date, authorized_date = EXCLUDED.authorized_date,
        category = EXCLUDED.category, category_detail = EXCLUDED.category_detail,
        payment_channel = EXCLUDED.payment_channel, pending = EXCLUDED.pending, synced_at = now()`);
    upserted++;
  }

  if (result.removed.length) {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM plaid_transactions WHERE transaction_id IN (${Prisma.join(result.removed)})`
    );
  }
  await prisma.$executeRaw(
    Prisma.sql`UPDATE plaid_items SET cursor = ${result.cursor}, last_synced_at = now() WHERE item_id = ${item.itemId}`
  );

  return { upserted, removed: result.removed.length, cursor: result.cursor };
}
