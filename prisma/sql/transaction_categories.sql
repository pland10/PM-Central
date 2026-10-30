-- Shared category list for "Category (yours)" on Accounting → Transactions,
-- managed on Admin → Transaction categories. While the list is open anyone can
-- add a category by typing it; once locked, only listed ones are accepted
-- (admins can still add).
--
-- Not in schema.prisma (like the plaid_* tables). The app also creates these on
-- first use (ensureCategoryTables in src/lib/transaction-categories-db.ts) and
-- seeds the list from categories already typed on transactions. Additive +
-- idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/transaction_categories.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS transaction_categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,              -- as it should be spelled
    created_by TEXT,                       -- email of who added it ('existing' = seeded)
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_categories_name_lower_idx
    ON transaction_categories (lower(name));

-- One row (id = 1): open = anyone can add new categories by typing them.
CREATE TABLE IF NOT EXISTS transaction_category_settings (
    id   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    open BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO transaction_category_settings (id, open) VALUES (1, true) ON CONFLICT (id) DO NOTHING;
