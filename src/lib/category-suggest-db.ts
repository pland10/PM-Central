import { Prisma, type PrismaClient } from "@prisma/client";
import { categoryHistoryFrom, type CategoryHistoryEntry } from "@/lib/category-suggest";

// Category counts per merchant over every transaction the page didn't load
// (`loadedIds`), so the Bank Transactions guess learns from all history, not
// just the latest rows on screen. A split charge counts by its lines (each has
// its own category), the charge itself only when it isn't split. Never throws:
// on any error the page just guesses from what's on screen.
export async function loadCategoryHistory(prisma: PrismaClient, loadedIds: string[]): Promise<CategoryHistoryEntry[]> {
  try {
    const rows = await prisma.$queryRaw<{ merchant: string | null; category: string; n: number; latest: Date | null }[]>(Prisma.sql`
      SELECT merchant, category, COUNT(*)::int AS n, MAX(posted_date) AS latest FROM (
        SELECT COALESCE(NULLIF(t.merchant_name, ''), t.name) AS merchant, t.category_override AS category, t.posted_date
          FROM plaid_transactions t
         WHERE t.category_override <> ''
           AND NOT (t.transaction_id = ANY(${loadedIds}::text[]))
           AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.transaction_id)
        UNION ALL
        SELECT COALESCE(NULLIF(t.merchant_name, ''), t.name), s.category_override, t.posted_date
          FROM transaction_splits s
          JOIN plaid_transactions t ON t.transaction_id = s.transaction_id
         WHERE s.category_override <> ''
           AND NOT (t.transaction_id = ANY(${loadedIds}::text[]))
      ) x
      GROUP BY merchant, category`);
    return categoryHistoryFrom(
      rows.map((r) => ({
        merchant: r.merchant ?? "",
        category: r.category,
        n: Number(r.n),
        latest: r.latest ? new Date(r.latest).toISOString().slice(0, 10) : null,
      }))
    );
  } catch {
    return [];
  }
}
