-- Payments table on Neon (dashboard: settlement status).
--
-- One structured row per Rentvine payment, written by settlement_sync.py in
-- pland10/leadsimple-search (alongside the searchable activities 'payment' row).
-- Keeps status + a numeric amount + the key dates queryable so the PM-Central
-- dashboard can aggregate "pending (in-flight)" vs "recently cleared" vs
-- "returned" without parsing text. Managed with raw SQL (not Prisma) to match
-- the other synced tables; nothing in schema.prisma references it.
--
-- Apply with:  psql "$DATABASE_URL" -f prisma/sql/payments.sql   (idempotent)

CREATE TABLE IF NOT EXISTS payments (
  source_id        TEXT PRIMARY KEY,         -- rvpay_<transactionID>
  transaction_id   TEXT,
  status           TEXT NOT NULL,            -- cleared, pending, returned, non_ach, voided
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  tenant           TEXT,
  property_address TEXT,
  owner            TEXT,
  date_posted      DATE,                     -- when the tenant paid
  date_created     TIMESTAMPTZ,
  clear_date       DATE,                     -- when ACH settled (cleared only)
  expected_clear   DATE,                     -- estimate for pending
  settlement_id    TEXT,
  description      TEXT,
  portfolio_id     TEXT,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_status_idx     ON payments(status);
CREATE INDEX IF NOT EXISTS payments_clear_date_idx ON payments(clear_date);
CREATE INDEX IF NOT EXISTS payments_posted_idx     ON payments(date_posted);
