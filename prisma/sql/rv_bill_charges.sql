-- Rentvine bill lines on Neon, for the Accounting → Bank Transactions
-- "Billed in Rentvine?" check (src/lib/rv-bill-match.ts).
--
-- One row per Rentvine "Bill Charge" transaction (type 7) — i.e. one bill
-- line, posted to the owner's ledger — in a rolling window (~180 days), with
-- its bill's payee and reference. Written by scripts/sync-rentvine-bills.ts
-- (sync-rentvine-bills.yml, every 2h by day); the sync creates the table on
-- first run and replaces its contents each run. property_external_id is the
-- BARE Rentvine propertyID (compare via rentvinePropertyId()).

CREATE TABLE IF NOT EXISTS rv_bill_charges (
  transaction_id       TEXT PRIMARY KEY,   -- Rentvine transactionID of the bill line
  bill_id              TEXT NOT NULL,      -- Rentvine billID (link: /accounting/bills/<id>)
  property_external_id TEXT,               -- bare Rentvine propertyID
  amount               NUMERIC(12,2) NOT NULL,
  date_posted          DATE NOT NULL,
  description          TEXT,
  payee                TEXT,               -- bill payee, e.g. "PMI Lighthouse Reimbursable"
  reference            TEXT,               -- bill reference, e.g. "143-26"
  synced_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rv_bill_charges_amount_idx ON rv_bill_charges (amount);
