import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decideCategory, type CategoryDecision, type CategoryUsage } from "@/lib/transaction-categories";

// Storage for the Transactions category list (prisma/sql/transaction_categories.sql):
//   transaction_categories          — the list (unique, case-insensitive)
//   transaction_category_settings   — one row: is the list open to everyone?
// Kept out of the Prisma model like the plaid_* tables and created on first use.
// The first run also seeds the list from categories already typed on
// transactions, so nothing in use is "unapproved" when the list is locked.

const DDL = [
  `CREATE TABLE IF NOT EXISTS transaction_categories (
     id         SERIAL PRIMARY KEY,
     name       TEXT NOT NULL,
     created_by TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS transaction_categories_name_lower_idx ON transaction_categories (lower(name))`,
  `CREATE TABLE IF NOT EXISTS transaction_category_settings (
     id   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     open BOOLEAN NOT NULL DEFAULT true
   )`,
  `INSERT INTO transaction_category_settings (id, open) VALUES (1, true) ON CONFLICT (id) DO NOTHING`,
];
const SEED = `INSERT INTO transaction_categories (name, created_by)
  SELECT DISTINCT btrim(category_override), 'existing' FROM plaid_transactions
  WHERE btrim(coalesce(category_override, '')) <> ''
  ON CONFLICT DO NOTHING`;

let tables: Promise<void> | null = null;
export function ensureCategoryTables(): Promise<void> {
  if (!tables) {
    tables = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
      // plaid_transactions may not exist yet on a fresh DB — nothing to seed then.
      await prisma.$executeRawUnsafe(SEED).catch(() => undefined);
    })().catch((e) => {
      tables = null; // let a later call retry
      throw e;
    });
  }
  return tables;
}

export async function isCategoryListOpen(): Promise<boolean> {
  await ensureCategoryTables();
  const rows = await prisma.$queryRaw<{ open: boolean }[]>(
    Prisma.sql`SELECT open FROM transaction_category_settings WHERE id = 1`
  );
  return rows[0]?.open ?? true;
}

export async function setCategoryListOpen(open: boolean): Promise<void> {
  await ensureCategoryTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO transaction_category_settings (id, open) VALUES (1, ${open})
    ON CONFLICT (id) DO UPDATE SET open = EXCLUDED.open`);
}

// Every listed category with how many transactions use it (case-insensitive).
export async function listCategoryUsage(): Promise<CategoryUsage[]> {
  await ensureCategoryTables();
  const rows = await prisma.$queryRaw<{ name: string; n: number }[]>(Prisma.sql`
    SELECT c.name, COUNT(t.transaction_id)::int AS n
    FROM transaction_categories c
    LEFT JOIN plaid_transactions t ON lower(btrim(t.category_override)) = lower(c.name)
    GROUP BY c.name
    ORDER BY lower(c.name)`);
  return rows.map((r) => ({ name: r.name, count: Number(r.n) }));
}

// For the Transactions page: never let a category-table problem break it.
export async function listCategoryNamesSafe(): Promise<string[]> {
  try {
    return (await listCategoryUsage()).map((c) => c.name);
  } catch {
    return [];
  }
}

export async function addCategory(name: string, by: string): Promise<void> {
  await ensureCategoryTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO transaction_categories (name, created_by) VALUES (${name}, ${by})
    ON CONFLICT DO NOTHING`);
}

// Move every transaction from `from` to `to`, then drop `from` from the list.
export async function mergeCategory(from: string, to: string, by: string): Promise<void> {
  await ensureCategoryTables();
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO transaction_categories (name, created_by) VALUES (${to}, ${by}) ON CONFLICT DO NOTHING`),
    prisma.$executeRaw(Prisma.sql`
      UPDATE plaid_transactions SET category_override = ${to}
      WHERE lower(btrim(category_override)) = lower(${from})`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_categories WHERE lower(name) = lower(${from})`),
  ]);
}

export async function deleteCategory(name: string): Promise<void> {
  await ensureCategoryTables();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_categories WHERE lower(name) = lower(${name})`);
}

// Used by the per-transaction save: resolve what the user typed against the
// list, adding it when allowed.
export async function resolveCategoryForSave(
  input: string,
  { isAdmin, by }: { isAdmin: boolean; by: string }
): Promise<CategoryDecision> {
  const [names, open] = await Promise.all([
    listCategoryUsage().then((u) => u.map((c) => c.name)),
    isCategoryListOpen(),
  ]);
  const decision = decideCategory(input, names, { open, isAdmin });
  if ("name" in decision && decision.isNew) await addCategory(decision.name, by);
  return decision;
}
