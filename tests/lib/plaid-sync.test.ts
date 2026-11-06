import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { archiveBeforeGoLive, goLiveDate, syncOneItem } from "@/lib/plaid-sync";
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
    // two upserts + the go-live archive + the cursor update (no removals)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it("deletes removed transactions as well", async () => {
    mockPlaid({ removed: ["gone1"] });
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;

    const r = await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: "c0" });

    expect(r.removed).toBe(1);
    // two upserts + one delete + the go-live archive + the cursor update
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
  });
});

describe("archiveBeforeGoLive", () => {
  it("files away every transaction dated before the go-live day (9/29/2026), whether or not it's checked off", async () => {
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(57) } as unknown as PrismaClient;

    expect(await archiveBeforeGoLive(prisma)).toBe(57);
    const call = vi.mocked(prisma.$executeRaw).mock.calls[0][0] as unknown as { values: unknown[] };
    const sql = sqlOf(call);
    expect(sql).toMatch(/UPDATE plaid_transactions/);
    expect(sql).toMatch(/SET archived = true/);
    expect(sql).toMatch(/archived = false/); // never re-stamps rows already archived
    expect(sql).toMatch(/posted_date < /);
    expect(sql).not.toMatch(/recorded_quickbooks|recorded_rentvine/); // done outside the app, before go-live
    expect(call.values).toEqual(expect.arrayContaining(["2026-09-29", "before go-live (2026-09-29)"]));
  });

  it("archives older-dated rows a sync brings in later", async () => {
    mockPlaid();
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
    await syncOneItem(prisma, { itemId: "item1", accessToken: "tok", cursor: null });
    const sqls = vi.mocked(prisma.$executeRaw).mock.calls.map((c) => sqlOf(c[0]));
    const archiveAt = sqls.findIndex((s) => /SET archived = true/.test(s));
    const lastUpsert = sqls.map((s) => /INSERT INTO plaid_transactions/.test(s)).lastIndexOf(true);
    expect(archiveAt).toBeGreaterThan(lastUpsert);
  });
});

describe("goLiveDate", () => {
  it("defaults to 2026-09-29 and can be overridden with ACCOUNTING_GO_LIVE_DATE", () => {
    expect(goLiveDate()).toBe("2026-09-29");
    vi.stubEnv("ACCOUNTING_GO_LIVE_DATE", "2026-10-01");
    expect(goLiveDate()).toBe("2026-10-01");
    vi.stubEnv("ACCOUNTING_GO_LIVE_DATE", "garbage");
    expect(goLiveDate()).toBe("2026-09-29");
  });
});
