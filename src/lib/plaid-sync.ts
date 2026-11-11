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
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS property_external_id TEXT`, // → properties.externalId
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS unit_external_id TEXT`, // → rentvine_units.unit_id
  // Archive: a row recorded in both QuickBooks and Rentvine can be filed away
  // (hidden from the active list, kept for review, unarchivable).
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS archived_by TEXT`,
  // Pending → posted: Plaid gives a posted charge a new id and (usually) the id
  // of the pending charge it replaced. The sync uses it to carry edits made on
  // the pending row over to the posted one. Plaid-owned (the upsert sets it).
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS pending_transaction_id TEXT`,
  // "Needs review": 'pending_dropped' (an edited pending charge vanished with
  // no posted replacement) | 'amount_changed' (edits carried over but the
  // posted amount differs). review_detail is a short human note.
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS review_reason TEXT`,
  `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS review_detail TEXT`,
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
): Promise<{ upserted: number; removed: number; cursor: string; carried: number; flagged: number; dropped: number }> {
  const result = await syncTransactions(item.accessToken, item.cursor || "");
  const names = await accountNames(item.accessToken);
  const rows = [...result.added, ...result.modified].map((t) => normalizeTransaction(t, names));

  let upserted = 0;
  for (const r of rows) {
    if (!r.transactionId) continue;
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO plaid_transactions (transaction_id, item_id, account_id, account_name, name,
        merchant_name, amount, iso_currency_code, posted_date, authorized_date, category,
        category_detail, payment_channel, pending, pending_transaction_id, synced_at)
      VALUES (${r.transactionId}, ${item.itemId}, ${r.accountId}, ${r.accountName}, ${r.name},
        ${r.merchantName}, ${r.amount}, ${r.isoCurrencyCode},
        ${r.postedDate}::date, ${r.authorizedDate}::date, ${r.category}, ${r.categoryDetail},
        ${r.paymentChannel}, ${r.pending}, ${r.pendingTransactionId}, now())
      ON CONFLICT (transaction_id) DO UPDATE SET
        account_name = EXCLUDED.account_name, name = EXCLUDED.name,
        merchant_name = EXCLUDED.merchant_name, amount = EXCLUDED.amount,
        posted_date = EXCLUDED.posted_date, authorized_date = EXCLUDED.authorized_date,
        category = EXCLUDED.category, category_detail = EXCLUDED.category_detail,
        payment_channel = EXCLUDED.payment_channel, pending = EXCLUDED.pending,
        pending_transaction_id = COALESCE(EXCLUDED.pending_transaction_id, plaid_transactions.pending_transaction_id),
        synced_at = now()`);
    upserted++;
  }

  // Pending → posted: copy whatever was edited on the pending row onto the
  // posted row that replaced it (filling only fields still empty there), flag
  // it for review if the amount changed, then drop the pending copy.
  let carried = 0;
  let flagged = 0;
  const linked = rows.filter((r) => r.transactionId && !r.pending && r.pendingTransactionId).map((r) => r.transactionId);
  if (linked.length) {
    const ids = Prisma.join(linked);
    carried = await prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions t SET
        reimbursable = COALESCE(t.reimbursable, p.reimbursable),
        category_override = COALESCE(NULLIF(t.category_override, ''), p.category_override),
        recorded_quickbooks = t.recorded_quickbooks OR p.recorded_quickbooks,
        recorded_rentvine = t.recorded_rentvine OR p.recorded_rentvine,
        notes = COALESCE(NULLIF(t.notes, ''), p.notes),
        property_external_id = COALESCE(t.property_external_id, p.property_external_id),
        unit_external_id = CASE WHEN t.property_external_id IS NULL THEN p.unit_external_id ELSE t.unit_external_id END,
        annotated_at = COALESCE(t.annotated_at, p.annotated_at),
        annotated_by = COALESCE(t.annotated_by, p.annotated_by)
      FROM plaid_transactions p
      WHERE t.transaction_id IN (${ids}) AND t.pending_transaction_id = p.transaction_id`);
    flagged = await prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions t SET
        review_reason = 'amount_changed',
        review_detail = 'Pending was $' || to_char(p.amount, 'FM999999990.00')
      FROM plaid_transactions p
      WHERE t.transaction_id IN (${ids}) AND t.pending_transaction_id = p.transaction_id
        AND p.annotated_at IS NOT NULL
        AND ABS(t.amount - p.amount) >= 0.005`);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM plaid_transactions
      WHERE pending = true AND transaction_id IN (
        SELECT pending_transaction_id FROM plaid_transactions
        WHERE transaction_id IN (${ids}) AND pending_transaction_id IS NOT NULL)`);
  }

  let dropped = 0;
  if (result.removed.length) {
    // Prune removed transactions — but keep any the user has annotated. Plaid
    // recycles ids (a pending charge is reported "removed" and re-added posted
    // under a new id), and deleting an annotated row would destroy its
    // reimbursable/category/recorded/notes values. Annotated rows Plaid dropped
    // are left behind (orphans the user can clear by hand) rather than wiped.
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM plaid_transactions
      WHERE transaction_id IN (${Prisma.join(result.removed)})
        AND reimbursable IS NULL
        AND (category_override IS NULL OR category_override = '')
        AND recorded_quickbooks = false
        AND recorded_rentvine = false
        AND archived = false
        AND (notes IS NULL OR notes = '')`);
    // What's left of the removed ones was edited by hand. An edited PENDING
    // charge that vanished without a posted replacement linking back to it goes
    // to the review box (the team moves the edits to the right charge or
    // dismisses it). If its replacement shows up in a later sync with the link,
    // the carry-over above still picks it up and clears it from the box.
    dropped = await prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions
      SET review_reason = 'pending_dropped',
          review_detail = 'Pending charge disappeared with no posted replacement'
      WHERE transaction_id IN (${Prisma.join(result.removed)})
        AND pending = true AND review_reason IS NULL`);
  }
  await prisma.$executeRaw(
    Prisma.sql`UPDATE plaid_items SET cursor = ${result.cursor}, last_synced_at = now() WHERE item_id = ${item.itemId}`
  );

  return { upserted, removed: result.removed.length, cursor: result.cursor, carried, flagged, dropped };
}
