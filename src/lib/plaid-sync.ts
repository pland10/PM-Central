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

export async function ensurePlaidTables(prisma: PrismaClient): Promise<void> {
  for (const stmt of DDL) await prisma.$executeRaw(stmt);
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
