import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import type { AnnotationPatch, Reimbursable } from "@/lib/transactions-view";
import type { SplitLine, StoredSplitLine } from "@/lib/transaction-splits";

// Storage for split lines (transaction_splits; created with the other
// plaid_transactions annotations in src/lib/plaid-sync.ts, documented in
// prisma/sql/plaid.sql). Pure rules live in src/lib/transaction-splits.ts.

type RawLine = {
  id: number;
  transaction_id: string;
  amount: Prisma.Decimal | number | string;
  reimbursable: string | null;
  category_override: string | null;
  recorded_quickbooks: boolean;
  recorded_rentvine: boolean;
  property_external_id: string | null;
  unit_external_id: string | null;
};
const LINE_COLS = Prisma.sql`id, transaction_id, amount, reimbursable, category_override, recorded_quickbooks,
  recorded_rentvine, property_external_id, unit_external_id`;
const reimb = (v: string | null): Reimbursable => (v === "yes" ? "yes" : v === "no" ? "no" : null);
const toLine = (r: RawLine): StoredSplitLine => ({
  id: Number(r.id),
  amount: Number(r.amount),
  reimbursable: reimb(r.reimbursable),
  categoryOverride: r.category_override ?? "",
  recordedQuickbooks: !!r.recorded_quickbooks,
  recordedRentvine: !!r.recorded_rentvine,
  propertyId: r.property_external_id || null,
  unitId: r.unit_external_id || null,
});

const ready = () => ensurePlaidAnnotationColumns(prisma);

// Lines for the given charges, in line order. {} if the table can't be read.
export async function loadSplits(transactionIds: string[]): Promise<Record<string, StoredSplitLine[]>> {
  if (transactionIds.length === 0) return {};
  try {
    await ready();
    const rows = await prisma.$queryRaw<RawLine[]>(Prisma.sql`
      SELECT ${LINE_COLS} FROM transaction_splits
      WHERE transaction_id = ANY(${transactionIds})
      ORDER BY transaction_id, line_no, id`);
    const out: Record<string, StoredSplitLine[]> = {};
    for (const r of rows) (out[r.transaction_id] ??= []).push(toLine(r));
    return out;
  } catch {
    return {};
  }
}

// The charge's amount (what the lines must add up to); null if it's not there.
export async function chargeAmount(transactionId: string): Promise<number | null> {
  await ready();
  const rows = await prisma.$queryRaw<{ amount: Prisma.Decimal | number | string | null }[]>(Prisma.sql`
    SELECT amount FROM plaid_transactions WHERE transaction_id = ${transactionId}`);
  return rows.length ? Number(rows[0].amount ?? 0) : null;
}

// Replace a charge's lines with these (one transaction), returning them stored.
export async function replaceSplits(transactionId: string, lines: SplitLine[]): Promise<StoredSplitLine[]> {
  await ready();
  const values = lines.map(
    (l, i) => Prisma.sql`(${transactionId}, ${i + 1}, ${l.amount}, ${l.reimbursable}, ${l.categoryOverride},
      ${l.recordedQuickbooks}, ${l.recordedRentvine}, ${l.propertyId}, ${l.unitId})`
  );
  const [, inserted] = await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_splits WHERE transaction_id = ${transactionId}`),
    prisma.$queryRaw<RawLine[]>(Prisma.sql`
      INSERT INTO transaction_splits (transaction_id, line_no, amount, reimbursable, category_override,
        recorded_quickbooks, recorded_rentvine, property_external_id, unit_external_id)
      VALUES ${Prisma.join(values)}
      RETURNING ${LINE_COLS}`),
  ]);
  return (inserted as RawLine[]).map(toLine);
}

// Unsplit: drop the lines and return the charge's own (header) fields, which
// were left as they were while it was split.
export async function deleteSplits(transactionId: string): Promise<{
  reimbursable: Reimbursable;
  categoryOverride: string;
  recordedQuickbooks: boolean;
  recordedRentvine: boolean;
  propertyId: string | null;
  unitId: string | null;
} | null> {
  await ready();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM transaction_splits WHERE transaction_id = ${transactionId}`);
  const rows = await prisma.$queryRaw<
    {
      reimbursable: string | null;
      category_override: string | null;
      recorded_quickbooks: boolean;
      recorded_rentvine: boolean;
      property_external_id: string | null;
      unit_external_id: string | null;
    }[]
  >(Prisma.sql`
    SELECT reimbursable, category_override, recorded_quickbooks, recorded_rentvine, property_external_id, unit_external_id
    FROM plaid_transactions WHERE transaction_id = ${transactionId}`);
  const r = rows[0];
  if (!r) return null;
  return {
    reimbursable: reimb(r.reimbursable),
    categoryOverride: r.category_override ?? "",
    recordedQuickbooks: !!r.recorded_quickbooks,
    recordedRentvine: !!r.recorded_rentvine,
    propertyId: r.property_external_id || null,
    unitId: r.unit_external_id || null,
  };
}

// Edit one line's fields (not its amount). false if the line isn't part of
// that charge.
export async function updateSplitLine(transactionId: string, lineId: number, patch: AnnotationPatch): Promise<boolean> {
  const sets: Prisma.Sql[] = [];
  if (patch.reimbursable !== undefined) sets.push(Prisma.sql`reimbursable = ${patch.reimbursable}`);
  if (patch.categoryOverride !== undefined) sets.push(Prisma.sql`category_override = ${patch.categoryOverride}`);
  if (patch.recordedQuickbooks !== undefined) sets.push(Prisma.sql`recorded_quickbooks = ${patch.recordedQuickbooks}`);
  if (patch.recordedRentvine !== undefined) sets.push(Prisma.sql`recorded_rentvine = ${patch.recordedRentvine}`);
  if (patch.propertyId !== undefined) sets.push(Prisma.sql`property_external_id = ${patch.propertyId}`);
  if (patch.unitId !== undefined) sets.push(Prisma.sql`unit_external_id = ${patch.unitId}`);
  if (sets.length === 0) return true;
  sets.push(Prisma.sql`updated_at = now()`);
  await ready();
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE transaction_splits SET ${Prisma.join(sets)} WHERE id = ${lineId} AND transaction_id = ${transactionId}`);
  return n > 0;
}

// Reimbursable on many lines at once (bulk select). Ids are line ids.
export async function setLinesReimbursable(lineIds: number[], value: Reimbursable): Promise<number> {
  if (lineIds.length === 0) return 0;
  await ready();
  return prisma.$executeRaw(Prisma.sql`
    UPDATE transaction_splits SET reimbursable = ${value}, updated_at = now() WHERE id = ANY(${lineIds})`);
}
