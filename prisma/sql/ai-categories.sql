-- Claude's category guesses for Bank Transactions (src/lib/ai-category-db.ts),
-- one row per transaction so each is sent to Claude once. category NULL = no
-- confident guess. App-owned; the code also creates it on first use.
-- Apply: npx prisma db execute --file prisma/sql/ai-categories.sql --schema prisma/schema.prisma
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS transaction_ai_categories (
  transaction_id TEXT PRIMARY KEY,
  category       TEXT,
  model          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
