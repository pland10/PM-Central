-- Management-company trust draws: batching the payments where PMI Lighthouse
-- takes money from the trust accounts and moves it to operating.
--
-- App-owned tables (NOT in schema.prisma), managed with additive SQL like the
-- other raw tables. The Accounting → Rentvine Transactions tab reads the live
-- payments from Rentvine (Check Register) and records here which ones have been
-- swept into a batch, so they aren't drawn twice. This is bookkeeping only — no
-- money moves and nothing is written back to Rentvine; the actual transfer is
-- done by hand at the bank.
--
-- Also created in code by ensurePayoutBatchTables (db-change skill, Pattern B);
-- this file is the canonical, documented, idempotent definition. Apply with:
--   npx prisma db execute --file prisma/sql/payout_batches.sql --schema prisma/schema.prisma

-- One row per locked batch (a set of draws the user committed to moving).
CREATE TABLE IF NOT EXISTS payout_batches (
    id           SERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT,                       -- email / 'operator'
    note         TEXT,
    item_count   INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- One row per payment that's been batched, keyed on Rentvine's payoutID so a
-- payment can only ever land in one batch. Amount/payee/etc. are snapshotted at
-- batch time (the source report is live and the payment could later change).
CREATE TABLE IF NOT EXISTS payout_batch_items (
    payout_id    TEXT PRIMARY KEY,           -- Rentvine payoutID
    batch_id     INT NOT NULL,               -- → payout_batches.id
    payee        TEXT,
    posted_date  DATE,
    memo         TEXT,
    amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT
);

CREATE INDEX IF NOT EXISTS payout_batch_items_batch_idx ON payout_batch_items (batch_id);
