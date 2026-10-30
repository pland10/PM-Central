-- Plaid integration: linked accounts + their transactions, on Neon.
--
-- Powers the Accounting → Transactions tab: card/bank transactions (Amex, Home
-- Depot, …) pulled from Plaid's /transactions/sync endpoint on a daily schedule.
--
-- Sync-owned, raw tables (NOT in schema.prisma), managed like rv_work_orders /
-- payments: the sync creates them with CREATE TABLE IF NOT EXISTS and this file
-- is the canonical, documented, idempotent definition. Additive only; safe to
-- re-run. Apply with (dev first, then prod — see db-change skill / DEPLOY.md):
--   npx prisma db execute --file prisma/sql/plaid.sql --schema prisma/schema.prisma
--
-- Credentials (PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV) live as secrets on
-- the service, never in this repo.

-- One row per linked institution item (a connected card/bank login). Holds the
-- Plaid access token and the incremental sync cursor.
--
-- SECURITY: access_token is Restricted data (it reads the owner's financial
-- data). It lives here because Neon encrypts data at rest and access is limited
-- to the app + named admins; treat it accordingly and consider app-level
-- encryption before connecting production (real) accounts.
CREATE TABLE IF NOT EXISTS plaid_items (
    item_id          TEXT PRIMARY KEY,   -- Plaid item_id
    access_token     TEXT NOT NULL,      -- Plaid access_token (Restricted)
    institution_id   TEXT,               -- Plaid institution_id
    institution_name TEXT,               -- e.g. "American Express", "The Home Depot"
    label            TEXT,               -- our display label for the account group
    cursor           TEXT,               -- /transactions/sync incremental cursor
    status           TEXT DEFAULT 'active', -- active | error | disconnected
    last_synced_at   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- One row per transaction, keyed on Plaid's transaction_id so re-syncing is
-- idempotent (upsert on the primary key). Amounts follow Plaid's convention:
-- positive = money out of the account (a purchase/charge), negative = money in.
CREATE TABLE IF NOT EXISTS plaid_transactions (
    transaction_id   TEXT PRIMARY KEY,   -- Plaid transaction_id
    item_id          TEXT,               -- → plaid_items.item_id (which login)
    account_id       TEXT,               -- Plaid account_id (which card)
    account_name     TEXT,               -- friendly account/institution name
    name             TEXT,               -- raw transaction description
    merchant_name    TEXT,               -- cleaned merchant (e.g. "The Home Depot")
    amount           NUMERIC(14,2),      -- positive = charge, negative = credit
    iso_currency_code TEXT,
    posted_date      DATE,               -- Plaid `date`
    authorized_date  DATE,
    category         TEXT,               -- personal_finance_category.primary
    category_detail  TEXT,               -- personal_finance_category.detailed
    payment_channel  TEXT,               -- online | in store | other
    pending          BOOLEAN DEFAULT false,
    synced_at        TIMESTAMPTZ DEFAULT now()
);

-- Table scans for the page: newest first, and per-account filtering.
CREATE INDEX IF NOT EXISTS plaid_transactions_posted_date_idx
    ON plaid_transactions (posted_date DESC);
CREATE INDEX IF NOT EXISTS plaid_transactions_item_id_idx
    ON plaid_transactions (item_id);

-- Hand-entered annotation columns, editable on the Transactions tab. The daily
-- sync NEVER writes these (its upsert's ON CONFLICT only SETs Plaid-owned
-- columns — see src/lib/plaid-sync.ts), so an edit survives a re-sync. Additive
-- + idempotent; also applied in code by ensurePlaidAnnotationColumns so a DB
-- that hasn't had this file run still self-heals on first read/write/sync.
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS reimbursable TEXT;              -- 'yes' | 'no' | null (unreviewed)
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS category_override TEXT;         -- the user's own category
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS recorded_quickbooks BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS recorded_rentvine BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS annotated_at TIMESTAMPTZ;       -- when an annotation was last saved
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS annotated_by TEXT;              -- who saved it (email / 'operator')
