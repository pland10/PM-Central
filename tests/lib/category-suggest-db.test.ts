import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../helpers/sql";
import { loadCategoryHistory } from "@/lib/category-suggest-db";
import { merchantKey } from "@/lib/category-suggest";

afterEach(() => vi.clearAllMocks());

function fakePrisma(result: unknown[] | Error) {
  const queryRaw = vi.fn(routeQueries([[/FROM plaid_transactions/, result]]));
  return { prisma: { $queryRaw: queryRaw } as unknown as PrismaClient, queryRaw };
}

describe("loadCategoryHistory", () => {
  it("counts categories per merchant over every transaction the page didn't load, split lines included", async () => {
    const { prisma, queryRaw } = fakePrisma([
      { merchant: "LOWES #2", category: "Repairs", n: 4, latest: new Date("2025-05-02T00:00:00Z") },
    ]);
    const out = await loadCategoryHistory(prisma, ["t1", "t2"]);
    expect(out).toEqual([{ key: merchantKey("LOWES", ""), category: "Repairs", count: 4, latest: "2025-05-02" }]);

    const q = queryRaw.mock.calls[0][0] as { values: unknown[] };
    const sql = sqlOf(q);
    expect(sql).toMatch(/category_override <> ''/);
    expect(sql).toMatch(/transaction_splits/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM transaction_splits/); // a split charge counts by its lines
    expect(sql).toMatch(/GROUP BY/);
    expect(q.values).toContainEqual(["t1", "t2"]);
  });

  it("returns nothing (never breaks the page) if the query fails", async () => {
    const { prisma } = fakePrisma(new Error("relation does not exist"));
    expect(await loadCategoryHistory(prisma, [])).toEqual([]);
  });
});
