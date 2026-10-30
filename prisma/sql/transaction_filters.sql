-- Admin hide filters for the Accounting → Transactions tab (Admin → Transaction
-- filters). Each row is a pattern like *CSG FORTE* plus a required comment on
-- why it exists; plaid_transactions whose name or merchant_name match are left
-- out of the tab and its totals.
--
-- Not in schema.prisma (like the plaid_* tables). The app also creates it on
-- first use (ensureHideRulesTable in src/lib/transaction-filters-db.ts), so
-- running this is optional. Additive + idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/transaction_filters.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS transaction_hide_rules (
    id         SERIAL PRIMARY KEY,
    pattern    TEXT NOT NULL UNIQUE,      -- as entered; * = wildcard, no * = contains
    comment    TEXT NOT NULL DEFAULT '',  -- why the rule exists (required in the UI)
    created_by TEXT,                      -- email of the admin who added it
    created_at TIMESTAMPTZ DEFAULT now()
);
