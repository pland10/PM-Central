import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../helpers/sql";
import { loadAiCategories, loadTxnsForAi, saveAiCategories } from "@/lib/ai-category-db";

afterEach(() => vi.clearAllMocks());

function fakePrisma(routes: [RegExp, unknown[] | Error][] = []) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(routes));
  const prisma = { $executeRaw: executeRaw, $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw } as unknown as PrismaClient;
  return { prisma, executeRaw, executeRawUnsafe, queryRaw };
}

describe("loadAiCategories", () => {
  it("returns the cached answer per transaction, including 'no guess' (null)", async () => {
    const { prisma, executeRawUnsafe } = fakePrisma([
      [/FROM transaction_ai_categories/, [{ transaction_id: "a", category: "Repairs" }, { transaction_id: "b", category: null }]],
    ]);
    expect(await loadAiCategories(prisma, ["a", "b", "c"])).toEqual({ a: "Repairs", b: null });
    expect(executeRawUnsafe.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS transaction_ai_categories/);
  });

  it("skips the query for no ids, and degrades to nothing on an error", async () => {
    const { prisma, queryRaw } = fakePrisma();
    expect(await loadAiCategories(prisma, [])).toEqual({});
    expect(queryRaw).not.toHaveBeenCalled();
    const { prisma: broken } = fakePrisma([[/FROM transaction_ai_categories/, new Error("boom")]]);
    expect(await loadAiCategories(broken, ["a"])).toEqual({});
  });
});

describe("saveAiCategories", () => {
  it("stores each answer once (a later answer never overwrites)", async () => {
    const { prisma, executeRaw } = fakePrisma();
    await saveAiCategories(prisma, { a: "Repairs", b: null }, "claude-opus-5-5");
    const q = executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlOf(q)).toMatch(/INSERT INTO transaction_ai_categories .* ON CONFLICT \(transaction_id\) DO NOTHING/s);
    expect(q.values).toEqual(expect.arrayContaining(["a", "Repairs", "b", null, "claude-opus-5-5"]));
  });

  it("does nothing for an empty answer", async () => {
    const { prisma, executeRaw } = fakePrisma();
    await saveAiCategories(prisma, {}, "m");
    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe("loadTxnsForAi", () => {
  it("loads only uncategorized, unsplit, unarchived transactions among the ids", async () => {
    const { prisma, queryRaw } = fakePrisma([
      [
        /FROM plaid_transactions/,
        [{ transaction_id: "a", merchant_name: "", name: "HOMEDEPOT #1", amount: "12.50", posted_date: new Date("2026-11-02T00:00:00Z") }],
      ],
    ]);
    expect(await loadTxnsForAi(prisma, ["a", "b"])).toEqual([
      { id: "a", merchant: "HOMEDEPOT #1", description: "HOMEDEPOT #1", amount: 12.5, date: "2026-11-02" },
    ]);
    const q = queryRaw.mock.calls[0][0] as { values: unknown[] };
    const sql = sqlOf(q);
    expect(sql).toMatch(/COALESCE\(category_override, ''\) = ''/);
    expect(sql).toMatch(/NOT COALESCE\(archived, false\)/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM transaction_splits/);
    expect(q.values).toContainEqual(["a", "b"]);
  });
});
