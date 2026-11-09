import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PreventivePattern } from "@/lib/preventive";

// Storage for the admin-managed preventive-maintenance keyword rules
// (preventive_patterns, see prisma/sql/preventive_patterns.sql). Kept out of the
// Prisma model like the plaid_* and transaction_hide_rules tables; the table is
// created on first use so no manual SQL step is needed.

let table: Promise<void> | null = null;
export function ensurePreventivePatternsTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS preventive_patterns (
           id         SERIAL PRIMARY KEY,
           pattern    TEXT NOT NULL UNIQUE,
           note       TEXT NOT NULL DEFAULT '',
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

type RawPattern = { id: number; pattern: string; note: string | null; created_by: string | null; created_at: Date | null };

export async function listPreventivePatterns(): Promise<PreventivePattern[]> {
  await ensurePreventivePatternsTable();
  const rows = await prisma.$queryRaw<RawPattern[]>(
    Prisma.sql`SELECT id, pattern, note, created_by, created_at FROM preventive_patterns ORDER BY pattern`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    pattern: r.pattern,
    note: r.note ?? "",
    createdBy: r.created_by ?? "",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

// For the Maintenance read path: never let a rules-table problem take the page
// down — fall back to just the built-in rules (an empty keyword list).
export async function listPreventivePatternsSafe(): Promise<PreventivePattern[]> {
  try {
    return await listPreventivePatterns();
  } catch {
    return [];
  }
}

export async function addPreventivePattern(pattern: string, note: string, by: string): Promise<void> {
  await ensurePreventivePatternsTable();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO preventive_patterns (pattern, note, created_by)
    VALUES (${pattern}, ${note}, ${by})
    ON CONFLICT (pattern) DO NOTHING`);
}

export async function deletePreventivePattern(id: number): Promise<void> {
  await ensurePreventivePatternsTable();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM preventive_patterns WHERE id = ${id}`);
}
