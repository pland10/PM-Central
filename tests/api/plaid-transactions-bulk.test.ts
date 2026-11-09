import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $queryRaw: vi.fn() },
}));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { PATCH } from "@/app/api/plaid/transactions/route";

const executeRaw = vi.mocked(prisma.$executeRaw);
const queryRaw = vi.mocked(prisma.$queryRaw);
const updates = () =>
  [...executeRaw.mock.calls, ...queryRaw.mock.calls].filter((c) => /UPDATE plaid_transactions/.test(sqlOf(c[0])));

function patch(body: unknown) {
  return PATCH(
    new NextRequest("https://pmilighthouse.app/api/plaid/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  executeRaw.mockResolvedValue(2);
  queryRaw.mockResolvedValue([{ transaction_id: "a" }, { transaction_id: "b" }] as never);
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/plaid/transactions (bulk)", () => {
  it("sets reimbursable on every selected transaction in one update, stamping who/when", async () => {
    const res = await patch({ ids: ["t1", "t2", "t1"], reimbursable: "yes" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 2 });

    expect(updates()).toHaveLength(1);
    const q = updates()[0][0] as { sql: string; values: unknown[] };
    expect(sqlOf(q)).toMatch(/reimbursable = .*annotated_at = now\(\).*annotated_by = .*WHERE transaction_id = ANY/);
    expect(q.values).toEqual(["yes", "admin@pmi.com", ["t1", "t2"]]);
  });

  it("can clear the flag back to unreviewed", async () => {
    await patch({ ids: ["t1"], reimbursable: null });
    expect((updates()[0][0] as { values: unknown[] }).values[0]).toBeNull();
  });

  it("skips pending transactions (guards pending = false)", async () => {
    await patch({ ids: ["t1", "t2"], reimbursable: "yes" });
    expect(sqlOf(updates()[0][0])).toMatch(/pending = false/);
  });

  it("rejects a request with no ids or no reimbursable value", async () => {
    expect((await patch({ ids: [], reimbursable: "yes" })).status).toBe(400);
    expect((await patch({ ids: ["t1"] })).status).toBe(400);
    expect((await patch({ ids: "t1", reimbursable: "yes" })).status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it("caps how many it will update at once", async () => {
    const ids = Array.from({ length: 5001 }, (_, i) => `t${i}`);
    expect((await patch({ ids, reimbursable: "no" })).status).toBe(400);
  });

  it("404s for a user who can't access accounting", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "nobody@x.com", role: "user" } as never);
    expect((await patch({ ids: ["t1"], reimbursable: "yes" })).status).toBe(404);
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await patch({ ids: ["t1"], reimbursable: "yes" })).status).toBe(404);
    expect(updates()).toHaveLength(0);
  });

  describe("archive all recorded", () => {
    it("archives every posted row eligible to archive in one update, stamping who/when", async () => {
      const res = await patch({ archiveAllRecorded: true });
      expect(res.status).toBe(200);
      // returns which rows it archived, so the page can offer Undo for exactly that batch
      expect(await res.json()).toEqual({ ok: true, archived: 2, ids: ["a", "b"] });

      expect(updates()).toHaveLength(1);
      const q = updates()[0][0] as { sql: string; values: unknown[] };
      const sql = sqlOf(q);
      expect(sql).toMatch(/archived = true/);
      expect(sql).toMatch(/archived_at = now\(\)/);
      expect(sql).toMatch(/archived_by =/);
      expect(sql).toMatch(/recorded_quickbooks = true/);
      expect(sql).toMatch(/recorded_rentvine = true OR reimbursable = 'no'/); // QB + (RV or not reimbursable)
      expect(sql).toMatch(/pending = false/);
      expect(sql).toMatch(/archived = false/); // skip rows already archived
      expect(q.values).toEqual(["admin@pmi.com"]);
      expect(sql).toMatch(/RETURNING transaction_id/);
    });

    it("needs neither ids nor a reimbursable value", async () => {
      // the archive action short-circuits before the ids/reimbursable check
      expect((await patch({ archiveAllRecorded: true })).status).toBe(200);
      expect(updates()).toHaveLength(1);
    });

    it("404s for a user who can't access accounting", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "nobody@x.com", role: "user" } as never);
      expect((await patch({ archiveAllRecorded: true })).status).toBe(404);
      vi.mocked(isFeatureEnabled).mockReturnValue(false);
      expect((await patch({ archiveAllRecorded: true })).status).toBe(404);
      expect(updates()).toHaveLength(0);
    });
  });

  describe("undo (unarchive a batch)", () => {
    it("puts back exactly the given rows, clearing the archive stamps", async () => {
      const res = await patch({ unarchiveIds: ["a", "b", "a"] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, unarchived: 2 });
      const q = updates()[0][0] as { sql: string; values: unknown[] };
      expect(sqlOf(q)).toMatch(/SET archived = false, archived_at = NULL, archived_by = NULL/);
      expect(sqlOf(q)).toMatch(/WHERE transaction_id = ANY/);
      expect(q.values).toEqual([["a", "b"]]);
    });

    it("rejects an empty or oversized batch, and 404s without accounting access", async () => {
      expect((await patch({ unarchiveIds: [] })).status).toBe(400);
      expect((await patch({ unarchiveIds: Array.from({ length: 5001 }, (_, i) => `t${i}`) })).status).toBe(400);
      vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "nobody@x.com", role: "user" } as never);
      expect((await patch({ unarchiveIds: ["a"] })).status).toBe(404);
      expect(updates()).toHaveLength(0);
    });
  });
});
