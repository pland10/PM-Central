import { Prisma, type PrismaClient } from "@prisma/client";
import type { AiTxn } from "@/lib/ai-category";

// Cache of Claude's category guesses (./ai-category.ts), one row per
// transaction, so each is sent to Claude once. category NULL = Claude had no
// confident guess. App-owned raw table (db-change skill, Pattern B; DDL also in
// prisma/sql/ai-categories.sql).

const DDL = `CREATE TABLE IF NOT EXISTS transaction_ai_categories (
  transaction_id TEXT PRIMARY KEY,
  category       TEXT,
  model          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = prisma
      .$executeRawUnsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
        ready = null; // let a later call retry
        throw e;
      });
  }
  return ready;
}

// Cached answers for these transactions: id → category, or null for "no guess".
// Transactions never asked about are absent. Never throws.
export async function loadAiCategories(prisma: PrismaClient, ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  try {
    await ensureTable(prisma);
    const rows = await prisma.$queryRaw<{ transaction_id: string; category: string | null }[]>(Prisma.sql`
      SELECT transaction_id, category FROM transaction_ai_categories WHERE transaction_id = ANY(${ids}::text[])`);
    return Object.fromEntries(rows.map((r) => [r.transaction_id, r.category]));
  } catch {
    return {};
  }
}

export async function saveAiCategories(prisma: PrismaClient, answers: Record<string, string | null>, model: string): Promise<void> {
  const entries = Object.entries(answers);
  if (entries.length === 0) return;
  await ensureTable(prisma);
  const rows = entries.map(([id, category]) => Prisma.sql`(${id}, ${category}, ${model})`);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO transaction_ai_categories (transaction_id, category, model)
    VALUES ${Prisma.join(rows)}
    ON CONFLICT (transaction_id) DO NOTHING`);
}

// The transactions among `ids` worth asking Claude about: no category yet,
// not split (each line has its own), not archived.
export async function loadTxnsForAi(prisma: PrismaClient, ids: string[]): Promise<AiTxn[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw<
    { transaction_id: string; merchant_name: string | null; name: string | null; amount: unknown; posted_date: Date | null }[]
  >(Prisma.sql`
    SELECT t.transaction_id, t.merchant_name, t.name, t.amount, t.posted_date
      FROM plaid_transactions t
     WHERE t.transaction_id = ANY(${ids}::text[])
       AND COALESCE(category_override, '') = ''
       AND NOT COALESCE(archived, false)
       AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.transaction_id)`);
  return rows.map((r) => ({
    id: r.transaction_id,
    merchant: r.merchant_name || r.name || "",
    description: r.name ?? "",
    amount: Number(r.amount) || 0,
    date: r.posted_date ? new Date(r.posted_date).toISOString().slice(0, 10) : null,
  }));
}
