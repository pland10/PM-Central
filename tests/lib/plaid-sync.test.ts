import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { syncOneItem } from "@/lib/plaid-sync";
import { sqlOf } from "../helpers/sql";

beforeEach(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "cid");
  vi.stubEnv("PLAID_SECRET", "sec");
  vi.stubEnv("PLAID_ENV", "sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mockPlaid(opts: { removed?: string[]; added?: Record<string, unknown>[] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/transactions/sync")) {
        return {
          ok: true,
          status: 200,
          text: async () => "",
          json: async () => ({
            added: opts.added ?? [
              { transaction_id: "t1", account_id: "a1", amount: 10, date: "2026-10-27", name: "X" },
              { transaction_id: "t2", account_id: "a1", amount: 20, date: "2026-10-26", name: "Y" },
            ],
            modified: [],
            removed: (opts.removed || []).map((id) => ({ transaction_id: id })),
            next_cursor: "cur1",
            has_more: false,
          }),
        };
      }
      if (u.includes("/accounts/get")) {
        return {
          ok: true,
          status: 200,
          text: async () => "",
          json: async () => ({ accounts: [{ account_id: "a1", official_name: "Amex" }] }),
        };
      }
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    })
  );
}

describe("syncOneItem", () => {
  it("upserts each transaction and persists the new cursor", async () => {
    mockPlaid();
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;

    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: null });

    expect(r).toEqual({ upserted: 2, removed: 0, cursor: "cur1", carried: 0, flagged: 0, dropped: 0 });
    // two upserts + the cursor update (no removals)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("deletes removed transactions as well", async () => {
    mockPlaid({ removed: ["gone1"] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;

    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });

    expect(r.removed).toBe(1);
    // two upserts + one delete + flag what's left + the cursor update
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(5);

    // The delete spares rows the user has annotated (Plaid recycles ids).
    const del = vi
      .mocked(prisma.$executeRaw)
      .mock.calls.map((c) => sqlOf(c[0]))
      .find((s) => /DELETE FROM plaid_transactions/.test(s))!;
    expect(del).toMatch(/reimbursable IS NULL/);
    expect(del).toMatch(/recorded_quickbooks = false/);
    expect(del).toMatch(/recorded_rentvine = false/);
    expect(del).toMatch(/notes IS NULL/);
    // …and rows with a notes thread (Bank Transactions → Notes) count as edited.
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM transaction_notes/);
  });

  const sqls = (prisma: PrismaClient) => vi.mocked(prisma.$executeRaw).mock.calls.map((c) => sqlOf(c[0]));

  it("stores the posted charge's link to its pending one", async () => {
    mockPlaid({ added: [{ transaction_id: "post1", pending_transaction_id: "pend1", account_id: "a1", amount: 45, date: "2026-11-10", name: "X" }] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
    await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });
    const upsert = vi.mocked(prisma.$executeRaw).mock.calls.find((c) => /INSERT INTO plaid_transactions/.test(sqlOf(c[0])))![0] as {
      values: unknown[];
    };
    expect(sqlOf(upsert)).toMatch(/pending_transaction_id/);
    expect(upsert.values).toContain("pend1");
  });

  it("carries edits from a pending charge onto the posted one that replaced it, flags amount changes, then drops the pending copy", async () => {
    mockPlaid({ added: [{ transaction_id: "post1", pending_transaction_id: "pend1", account_id: "a1", amount: 52, date: "2026-11-10", name: "X" }] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });

    const all = sqls(prisma);
    const copy = all.findIndex((s) => /UPDATE plaid_transactions t SET/.test(s) && /reimbursable = COALESCE\(t\.reimbursable, p\.reimbursable\)/.test(s));
    const flag = all.findIndex((s) => /review_reason = 'amount_changed'/.test(s));
    const drop = all.findIndex((s) => /DELETE FROM plaid_transactions/.test(s) && /pending_transaction_id/.test(s));
    expect(copy).toBeGreaterThan(-1);
    expect(all[copy]).toMatch(/t\.pending_transaction_id = p\.transaction_id/);
    expect(all[copy]).toMatch(/property_external_id = COALESCE\(t\.property_external_id, p\.property_external_id\)/);
    expect(all[flag]).toMatch(/ABS\(t\.amount - p\.amount\) >= 0\.005/);
    expect(flag).toBeGreaterThan(copy);
    expect(drop).toBeGreaterThan(flag);
    expect(r).toMatchObject({ carried: 1, flagged: 1 });
  });

  it("puts an edited pending charge that vanished with no posted replacement in the review box", async () => {
    mockPlaid({ added: [], removed: ["pend7"] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });
    const all = sqls(prisma);
    const del = all.findIndex((s) => /DELETE FROM plaid_transactions/.test(s) && /reimbursable IS NULL/.test(s));
    const mark = all.findIndex((s) => /review_reason = 'pending_dropped'/.test(s));
    expect(mark).toBeGreaterThan(del); // only the annotated ones survive the delete
    expect(all[mark]).toMatch(/pending = true/);
    expect(r.dropped).toBe(1);
  });

  it("moves a pending charge's notes thread onto the posted charge before dropping the pending copy", async () => {
    mockPlaid({ added: [{ transaction_id: "post1", pending_transaction_id: "pend1", account_id: "a1", amount: 52, date: "2026-11-10", name: "X" }] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
    await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });
    const all = sqls(prisma);
    const move = all.findIndex((s) => /UPDATE transaction_notes/.test(s));
    const drop = all.findIndex((s) => /DELETE FROM plaid_transactions WHERE pending = true/.test(s));
    expect(move).toBeGreaterThan(-1);
    expect(all[move]).toMatch(/t\.pending_transaction_id = n\.transaction_id/);
    expect(move).toBeLessThan(drop);
    // a pending charge that only had notes still gets the amount-changed flag
    const flag = all.find((s) => /review_reason = 'amount_changed'/.test(s))!;
    expect(flag).toMatch(/EXISTS \(SELECT 1 FROM transaction_notes/);
  });
});
