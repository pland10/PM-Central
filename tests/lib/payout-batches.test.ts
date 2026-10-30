import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createPayoutBatch, mergeBatched } from "@/lib/payout-batches";
import type { MoneyOutRow } from "@/lib/accounting";
import { sqlOf } from "../helpers/sql";

afterEach(() => vi.clearAllMocks());

const row = (over: Partial<MoneyOutRow>): MoneyOutRow => ({
  payoutId: "x",
  date: "2026-08-01",
  payee: "PMI Lighthouse",
  payeeType: "Manager",
  method: "eCheck (ACH)",
  checkNumber: "",
  memo: "",
  amount: 0,
  ...over,
});

// A prisma whose payout_batch_items INSERT returns a row unless the payout_id is
// in `alreadyBatched` (simulating ON CONFLICT DO NOTHING).
function fakePrisma(alreadyBatched: string[] = []) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(async (q: unknown) => {
    const sql = sqlOf(q);
    if (/INSERT INTO payout_batches/.test(sql)) return [{ id: 7 }];
    if (/INSERT INTO payout_batch_items/.test(sql)) {
      const id = (q as { values: unknown[] }).values[0] as string;
      return alreadyBatched.includes(id) ? [] : [{ payout_id: id }];
    }
    return [];
  });
  const prisma = { $executeRaw: executeRaw, $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw } as unknown as PrismaClient;
  return { prisma, executeRaw, queryRaw };
}

describe("mergeBatched", () => {
  it("flags each row with its batch state", () => {
    const merged = mergeBatched([row({ payoutId: "a" }), row({ payoutId: "b" })], new Map([["a", { batchId: 3, batchedAt: "2026-08-02T00:00:00Z" }]]));
    expect(merged[0]).toMatchObject({ payoutId: "a", batched: true, batchId: 3 });
    expect(merged[1]).toMatchObject({ payoutId: "b", batched: false, batchId: null, batchedAt: null });
  });
});

describe("createPayoutBatch", () => {
  it("inserts the header + new items, totals them, and stamps the header", async () => {
    const { prisma, executeRaw } = fakePrisma(["dup"]);
    const res = await createPayoutBatch(
      prisma,
      [
        { payoutId: "a", amount: 100, payee: "PMI Lighthouse", postedDate: "2026-08-01", memo: "fees" },
        { payoutId: "dup", amount: 50, payee: "PMI Lighthouse Reimbursable" }, // already batched
      ],
      { by: "admin@pmi.com", note: "august" }
    );

    expect(res).toEqual({ batchId: 7, count: 1, total: 100, skipped: ["dup"] });
    // header count/total written back
    const update = executeRaw.mock.calls.map((c) => sqlOf(c[0])).find((s) => /UPDATE payout_batches SET item_count/.test(s));
    expect(update).toBeTruthy();
  });

  it("leaves no empty header when everything was already batched", async () => {
    const { prisma, executeRaw } = fakePrisma(["a", "b"]);
    const res = await createPayoutBatch(prisma, [
      { payoutId: "a", amount: 1 },
      { payoutId: "b", amount: 2 },
    ]);

    expect(res).toEqual({ batchId: null, count: 0, total: 0, skipped: ["a", "b"] });
    expect(executeRaw.mock.calls.some((c) => /DELETE FROM payout_batches/.test(sqlOf(c[0])))).toBe(true);
  });

  it("no-ops on an empty selection", async () => {
    const { prisma, queryRaw } = fakePrisma();
    const res = await createPayoutBatch(prisma, []);
    expect(res).toEqual({ batchId: null, count: 0, total: 0, skipped: [] });
    expect(queryRaw).not.toHaveBeenCalled(); // never inserted a header
  });
});
