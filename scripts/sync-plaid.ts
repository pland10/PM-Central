import { PrismaClient, Prisma } from "@prisma/client";
import { syncTransactions, normalizeTransaction, plaidPost, isPlaidConfigured } from "../src/lib/plaid";

// Daily Plaid transaction sync. For each linked account in plaid_items, pulls
// new/updated/removed transactions via /transactions/sync (incremental, by
// cursor) and upserts them into plaid_transactions, then saves the new cursor:
//
//   npm run sync:plaid
//
// Sync-owned raw tables (see prisma/sql/plaid.sql), managed with raw SQL like
// rv_work_orders. Idempotent: keyed on Plaid's transaction_id, cursor-based, so
// re-runs never duplicate. No-ops cleanly when no accounts are linked yet.
//
// Creds: PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV + DATABASE_URL.

const DDL = [
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

type ItemRow = { item_id: string; access_token: string; cursor: string | null };

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

async function main() {
  if (!isPlaidConfigured()) {
    console.log("Plaid not configured (PLAID_CLIENT_ID / PLAID_SECRET) — skipping.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("[ERROR] DATABASE_URL not set.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    for (const stmt of DDL) await prisma.$executeRaw(stmt);

    const items = await prisma.$queryRaw<ItemRow[]>(
      Prisma.sql`SELECT item_id, access_token, cursor FROM plaid_items WHERE status = 'active'`
    );
    console.log(`${items.length} linked account(s) to sync.`);

    let upserted = 0;
    let removed = 0;
    for (const item of items) {
      const result = await syncTransactions(item.access_token, item.cursor || "");
      const names = await accountNames(item.access_token);
      const rows = [...result.added, ...result.modified].map((t) => normalizeTransaction(t, names));

      for (const r of rows) {
        if (!r.transactionId) continue;
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO plaid_transactions (transaction_id, item_id, account_id, account_name, name,
            merchant_name, amount, iso_currency_code, posted_date, authorized_date, category,
            category_detail, payment_channel, pending, synced_at)
          VALUES (${r.transactionId}, ${item.item_id}, ${r.accountId}, ${r.accountName}, ${r.name},
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
        removed += result.removed.length;
      }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE plaid_items SET cursor = ${result.cursor}, last_synced_at = now() WHERE item_id = ${item.item_id}`);
    }

    console.log(`Synced ${upserted} transaction(s), removed ${removed}, across ${items.length} account(s).`);

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('plaid_transactions', now(), ${`${upserted} upserted, ${items.length} account(s)`})
        ON CONFLICT (job) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`);
    } catch (e) {
      console.log(`  [warn] could not write sync_status heartbeat: ${e instanceof Error ? e.message : e}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nPlaid sync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
