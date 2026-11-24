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

-- Notes thread per owner (portfolio), across months; each note keeps the month
-- it was written for. Also created on first use by src/lib/owner-draw-notes-db.ts.
CREATE TABLE IF NOT EXISTS owner_draw_notes (
  id           SERIAL PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  month        TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_email TEXT,
  author_name  TEXT,
  emailed_to   TEXT,
  emailed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS owner_draw_notes_portfolio_idx ON owner_draw_notes (portfolio_id, created_at DESC);

-- One-time copy of the old single note per row into the thread (flagged so it
-- never repeats).
ALTER TABLE owner_draws ADD COLUMN IF NOT EXISTS note_migrated BOOLEAN NOT NULL DEFAULT false;
WITH moved AS (
  UPDATE owner_draws SET note_migrated = true
  WHERE note_migrated = false AND btrim(note) <> ''
  RETURNING portfolio_id, month, note, updated_by, updated_at
)
INSERT INTO owner_draw_notes (portfolio_id, month, body, author_name, created_at)
SELECT portfolio_id, month, btrim(note), COALESCE(updated_by, 'Earlier note'), updated_at FROM moved;
