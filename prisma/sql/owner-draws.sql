-- Owner Draws (Accounting → Owner Draws). App-owned; also created on first use
-- by src/lib/owner-draws-db.ts. Idempotent — safe to re-run:
--   prisma db execute --file prisma/sql/owner-draws.sql --schema prisma/schema.prisma
--
-- One row per portfolio per month ("YYYY-MM"): edits to Rentvine's numbers for
-- that month, the coordinator's note, approval / paid (who + when), and the
-- Rentvine figures frozen at approval (snapshot).
CREATE TABLE IF NOT EXISTS owner_draws (
  month            TEXT NOT NULL,
  portfolio_id     TEXT NOT NULL,
  balance_override NUMERIC(12,2),
  reserve_override NUMERIC(12,2),
  unpaid_override  NUMERIC(12,2),
  note             TEXT NOT NULL DEFAULT '',
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT,
  paid_at          TIMESTAMPTZ,
  paid_by          TEXT,
  snapshot         JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT,
  PRIMARY KEY (month, portfolio_id)
);
