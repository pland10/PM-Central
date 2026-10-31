import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { confirmPayoutBatch, createPayoutBatch, mergeBatched, removeBatchItem, summarizeByAccount } from "@/lib/payout-batches";
import type { MoneyOutRow } from "@/lib/accounting";
import { sqlOf } from "../helpers/sql";

afterEach(() => vi.clearAllMocks());

const row = (over: Partial<MoneyOutRow>): MoneyOutRow => ({
  payoutId: "x",
  bankAccount: "Residential Trust",
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

describe("summarizeByAccount", () => {
  it("rolls draws up by source account, biggest first", () => {
    const out = summarizeByAccount([
      { bankAccount: "Residential Trust", amount: 100 },
      { bankAccount: "Security Deposit", amount: 50 },
      { bankAccount: "Residential Trust", amount: 25 },
      { bankAccount: "", amount: 10 },
    ]);
    expect(out).toEqual([
      { account: "Residential Trust", count: 2, total: 125 },
      { account: "Security Deposit", count: 1, total: 50 },
      { account: "—", count: 1, total: 10 },
    ]);
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

// Routes the two SELECTs removeBatchItem runs: the item lookup and the remaining
// count/total after the delete.
function fakeRemovePrisma(opts: { found?: { batch_id: number; amount: number; bank_account: string | null }; remaining: number; total?: number }) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const queryRaw = vi.fn(async (q: unknown) => {
    const sql = sqlOf(q);
    if (/FROM payout_batch_items WHERE payout_id/.test(sql)) return opts.found ? [opts.found] : [];
    if (/COUNT\(\*\)/.test(sql)) return [{ n: opts.remaining, total: opts.total ?? 0 }];
    return [];
  });
  const prisma = { $executeRaw: executeRaw, $executeRawUnsafe: vi.fn().mockResolvedValue(0), $queryRaw: queryRaw } as unknown as PrismaClient;
  return { prisma, executeRaw };
}

describe("confirmPayoutBatch", () => {
  it("stamps confirmed_at only while still pending, reporting whether it changed a row", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const prisma = { $executeRaw: executeRaw, $executeRawUnsafe: vi.fn().mockResolvedValue(0) } as unknown as PrismaClient;

    expect(await confirmPayoutBatch(prisma, 7, "admin@pmi.com")).toBe(true);
    const sql = sqlOf(executeRaw.mock.calls[0][0]);
    expect(sql).toMatch(/UPDATE payout_batches SET confirmed_at = now\(\)/);
    expect(sql).toMatch(/confirmed_at IS NULL/); // no-op if already confirmed

    executeRaw.mockResolvedValue(0);
    expect(await confirmPayoutBatch(prisma, 7, "admin@pmi.com")).toBe(false);
  });
});

describe("removeBatchItem", () => {
  it("deletes the item and drops the batch when it's now empty", async () => {
    const { prisma, executeRaw } = fakeRemovePrisma({ found: { batch_id: 7, amount: 999, bank_account: "Residential Trust" }, remaining: 0 });
    const res = await removeBatchItem(prisma, "c");
    expect(res).toEqual({ removed: { payoutId: "c", amount: 999, bankAccount: "Residential Trust", batchId: 7 }, batchEmptied: true });
    expect(executeRaw.mock.calls.some((c) => /DELETE FROM payout_batches/.test(sqlOf(c[0])))).toBe(true);
  });

  it("re-totals the batch when items remain", async () => {
    const { prisma, executeRaw } = fakeRemovePrisma({ found: { batch_id: 7, amount: 50, bank_account: "Security Deposit" }, remaining: 2, total: 150 });
    const res = await removeBatchItem(prisma, "x");
    expect(res.batchEmptied).toBe(false);
    expect(executeRaw.mock.calls.some((c) => /UPDATE payout_batches SET item_count/.test(sqlOf(c[0])))).toBe(true);
  });

  it("returns removed:null when the payment isn't in a batch", async () => {
    const { prisma } = fakeRemovePrisma({ remaining: 0 });
    expect(await removeBatchItem(prisma, "nope")).toEqual({ removed: null, batchEmptied: false });
  });
});
