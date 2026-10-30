import { Prisma, type PrismaClient } from "@prisma/client";
import type { MoneyOutRow } from "@/lib/accounting";

// Batching of management-company trust draws. App-owned tables (see
// prisma/sql/payout_batches.sql): payout_batches (one per locked batch) and
// payout_batch_items (one per payment, keyed on Rentvine's payoutID so a
// payment can't be batched twice). Bookkeeping only — no money moves here.

const DDL = [
  `CREATE TABLE IF NOT EXISTS payout_batches (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT,
    note TEXT, item_count INT NOT NULL DEFAULT 0, total_amount NUMERIC(14,2) NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS payout_batch_items (
    payout_id TEXT PRIMARY KEY, batch_id INT NOT NULL, payee TEXT, posted_date DATE, memo TEXT,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT)`,
  `CREATE INDEX IF NOT EXISTS payout_batch_items_batch_idx ON payout_batch_items (batch_id)`,
];

// Lazy ensure-guard (db-change skill, Pattern B): create the tables once per
// process before first use. Static SQL, so $executeRawUnsafe is safe.
let ready: Promise<void> | null = null;
export function ensurePayoutBatchTables(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export type BatchInfo = { batchId: number; batchedAt: string };

// payoutID → batch info, for the payments currently shown. Degrades to an empty
// map if the tables aren't there yet (nothing batched).
export async function fetchBatchedMap(
  prisma: PrismaClient,
  payoutIds: string[]
): Promise<Map<string, BatchInfo>> {
  const ids = payoutIds.filter((id) => id);
  if (ids.length === 0) return new Map();
  try {
    await ensurePayoutBatchTables(prisma);
    const rows = await prisma.$queryRaw<{ payout_id: string; batch_id: number; created_at: Date }[]>(
      Prisma.sql`SELECT payout_id, batch_id, created_at FROM payout_batch_items WHERE payout_id IN (${Prisma.join(ids)})`
    );
    return new Map(
      rows.map((r) => [r.payout_id, { batchId: r.batch_id, batchedAt: r.created_at.toISOString() }])
    );
  } catch {
    return new Map();
  }
}

export type ManagementDrawRow = MoneyOutRow & {
  batched: boolean;
  batchId: number | null;
  batchedAt: string | null;
};

// Attach each row's batch state. Pure.
export function mergeBatched(rows: MoneyOutRow[], batched: Map<string, BatchInfo>): ManagementDrawRow[] {
  return rows.map((r) => {
    const b = batched.get(r.payoutId);
    return { ...r, batched: !!b, batchId: b?.batchId ?? null, batchedAt: b?.batchedAt ?? null };
  });
}

export type BatchItemInput = {
  payoutId: string;
  payee?: string;
  postedDate?: string | null;
  memo?: string;
  amount: number;
};

export type CreateBatchResult = {
  batchId: number | null;
  count: number;
  total: number;
  skipped: string[]; // payoutIds that were already in a batch
};

// Lock a batch: insert the header + the selected items (skipping any already
// batched, keyed on payout_id), then stamp the header's count/total. An empty
// result (everything already batched) leaves no header behind.
export async function createPayoutBatch(
  prisma: PrismaClient,
  items: BatchItemInput[],
  opts: { note?: string | null; by?: string | null } = {}
): Promise<CreateBatchResult> {
  await ensurePayoutBatchTables(prisma);
  const clean = items.filter((i) => i && typeof i.payoutId === "string" && i.payoutId.trim() !== "");
  if (clean.length === 0) return { batchId: null, count: 0, total: 0, skipped: [] };

  const header = await prisma.$queryRaw<{ id: number }[]>(
    Prisma.sql`INSERT INTO payout_batches (created_by, note) VALUES (${opts.by ?? null}, ${opts.note ?? null}) RETURNING id`
  );
  const batchId = header[0].id;

  const inserted: { payoutId: string; amount: number }[] = [];
  for (const i of clean) {
    const amount = round2(i.amount);
    const postedDate = i.postedDate && i.postedDate.trim() ? i.postedDate : null;
    const r = await prisma.$queryRaw<{ payout_id: string }[]>(Prisma.sql`
      INSERT INTO payout_batch_items (payout_id, batch_id, payee, posted_date, memo, amount, created_by)
      VALUES (${i.payoutId}, ${batchId}, ${i.payee ?? null}, ${postedDate}::date, ${i.memo ?? null}, ${amount}, ${opts.by ?? null})
      ON CONFLICT (payout_id) DO NOTHING
      RETURNING payout_id`);
    if (r.length) inserted.push({ payoutId: i.payoutId, amount });
  }

  const count = inserted.length;
  const total = round2(inserted.reduce((s, r) => s + r.amount, 0));
  const skipped = clean.map((i) => i.payoutId).filter((id) => !inserted.some((x) => x.payoutId === id));

  if (count === 0) {
    // Everything was already batched — don't leave an empty header behind.
    await prisma.$executeRaw(Prisma.sql`DELETE FROM payout_batches WHERE id = ${batchId}`);
    return { batchId: null, count: 0, total: 0, skipped };
  }

  await prisma.$executeRaw(
    Prisma.sql`UPDATE payout_batches SET item_count = ${count}, total_amount = ${total} WHERE id = ${batchId}`
  );
  return { batchId, count, total, skipped };
}

export type BatchSummary = {
  id: number;
  createdAt: string;
  createdBy: string;
  note: string;
  count: number;
  total: number;
};

export async function listRecentBatches(prisma: PrismaClient, limit = 10): Promise<BatchSummary[]> {
  try {
    await ensurePayoutBatchTables(prisma);
    const rows = await prisma.$queryRaw<
      { id: number; created_at: Date; created_by: string | null; note: string | null; item_count: number; total_amount: Prisma.Decimal | number }[]
    >(Prisma.sql`
      SELECT id, created_at, created_by, note, item_count, total_amount
      FROM payout_batches ORDER BY id DESC LIMIT ${limit}`);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      createdBy: r.created_by ?? "",
      note: r.note ?? "",
      count: r.item_count,
      total: typeof r.total_amount === "number" ? r.total_amount : Number(r.total_amount),
    }));
  } catch {
    return [];
  }
}
