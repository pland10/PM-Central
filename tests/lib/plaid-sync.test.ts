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

function mockPlaid(opts: { removed?: string[] } = {}) {
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
            added: [
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

    expect(r).toEqual({ upserted: 2, removed: 0, cursor: "cur1" });
    // two upserts + the cursor update (no removals)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("deletes removed transactions as well", async () => {
    mockPlaid({ removed: ["gone1"] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;

    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });

    expect(r.removed).toBe(1);
    // two upserts + one delete + the cursor update
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);

    // The delete spares rows the user has annotated (Plaid recycles ids).
    const del = vi
      .mocked(prisma.$executeRaw)
      .mock.calls.map((c) => sqlOf(c[0]))
      .find((s) => /DELETE FROM plaid_transactions/.test(s))!;
    expect(del).toMatch(/reimbursable IS NULL/);
    expect(del).toMatch(/recorded_quickbooks = false/);
    expect(del).toMatch(/recorded_rentvine = false/);
    expect(del).toMatch(/notes IS NULL/);
  });
});
