-- Admin-managed title rules for preventive (routine/scheduled) maintenance
-- (Admin → Preventive maintenance). Each row is a keyword; any work order whose
-- title contains it (case-insensitive) is treated as preventive and kept off
-- the Maintenance "Needs attention" list.
--
-- These are ADDITIVE to the built-in rules in src/lib/preventive.ts and to
-- Rentvine recurring work orders — removing a keyword here never affects those.
--
-- Not in schema.prisma (like the plaid_* and transaction_hide_rules tables).
-- The app also creates it on first use (ensurePreventivePatternsTable in
-- src/lib/preventive-patterns-db.ts), so running this is optional. Additive +
-- idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/preventive_patterns.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS preventive_patterns (
    id         SERIAL PRIMARY KEY,
    pattern    TEXT NOT NULL UNIQUE,      -- keyword; matches anywhere in the title, case-insensitive
    note       TEXT NOT NULL DEFAULT '',  -- optional note on why the rule exists
    created_by TEXT,                      -- email of the admin who added it
    created_at TIMESTAMPTZ DEFAULT now()
);
