import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { HideRule } from "@/lib/transaction-filters";

// Storage for the Transactions hide filters (transaction_hide_rules, see
// prisma/sql/transaction_filters.sql). Kept out of the Prisma model like the
// plaid_* tables; the table is created on first use so no manual SQL step is
// needed.

let table: Promise<void> | null = null;
export function ensureHideRulesTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS transaction_hide_rules (
           id         SERIAL PRIMARY KEY,
           pattern    TEXT NOT NULL UNIQUE,
           comment    TEXT NOT NULL DEFAULT '',
           created_by TEXT,
           created_at TIMESTAMPTZ DEFAULT now()
         )`
      )
      .then(() => undefined)
      .catch((e) => {
        table = null; // let a later call retry
        throw e;
      });
  }
  return table;
}

type RawRule = { id: number; pattern: string; comment: string | null; created_by: string | null; created_at: Date | null };

export async function listHideRules(): Promise<HideRule[]> {
  await ensureHideRulesTable();
  const rows = await prisma.$queryRaw<RawRule[]>(
    Prisma.sql`SELECT id, pattern, comment, created_by, created_at FROM transaction_hide_rules ORDER BY pattern`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    pattern: r.pattern,
    comment: r.comment ?? "",
    createdBy: r.created_by ?? "",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

// For the Transactions page: never let a filter-table problem take the page
// down — show everything instead.
export async function listHideRulesSafe(): Promise<HideRule[]> {
  try {
    return await listHideRules();
  } catch {
    return [];
  }
}

export async function addHideRule(pattern: string, comment: string, by: string): Promise<void> {
  await ensureHideRulesTable();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO transaction_hide_rules (pattern, comment, created_by)
    VALUES (${pattern}, ${comment}, ${by})
    ON CONFLICT (pattern) DO NOTHING`);
}

export async function updateHideRuleComment(id: number, comment: string): Promise<void> {
  await ensureHideRulesTable();
  await prisma.$executeRaw(Prisma.sql`UPDATE transaction_hide_rules SET comment = ${comment} WHERE id = ${id}`);
}

export async function deleteHideRule(id: number): Promise<void> {
  await ensureHideRulesTable();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_hide_rules WHERE id = ${id}`);
}
