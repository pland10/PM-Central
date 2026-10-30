import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: vi.fn().mockResolvedValue(1), $executeRawUnsafe: vi.fn().mockResolvedValue(1) },
}));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/transaction-categories-db", () => ({ resolveCategoryForSave: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { resolveCategoryForSave } from "@/lib/transaction-categories-db";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { PATCH } from "@/app/api/plaid/transactions/[transactionId]/route";

const executeRaw = vi.mocked(prisma.$executeRaw);

function patch(body: unknown, id = "txn_1") {
  const req = new NextRequest(`https://pmilighthouse.app/api/plaid/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ transactionId: id }) });
}

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/plaid/transactions/:id", () => {
  it("updates only the provided fields and stamps who/when", async () => {
    const res = await patch({ reimbursable: "yes", recordedQuickbooks: true });
    expect(res.status).toBe(200);

    const update = executeRaw.mock.calls.map((c) => sqlOf(c[0])).find((s) => /UPDATE plaid_transactions/.test(s))!;
    expect(update).toMatch(/reimbursable =/);
    expect(update).toMatch(/recorded_quickbooks =/);
    expect(update).toMatch(/annotated_at = now\(\)/);
    expect(update).toMatch(/annotated_by =/);
    expect(update).toMatch(/WHERE transaction_id =/);
    // untouched fields aren't in the SET clause
    expect(update).not.toMatch(/recorded_rentvine =/);
    expect(update).not.toMatch(/\bnotes =/);
  });

  it("rejects a body with no known fields", async () => {
    const res = await patch({ nope: 1 });
    expect(res.status).toBe(400);
    expect(executeRaw.mock.calls.some((c) => /UPDATE/.test(sqlOf(c[0])))).toBe(false);
  });

  it("404s when the accounting feature is off", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await patch({ reimbursable: "yes" })).status).toBe(404);
  });

  it("404s for a user who can't access accounting", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "nobody@x.com", role: "user" } as never);
    const res = await patch({ reimbursable: "yes" });
    expect(res.status).toBe(404);
    expect(executeRaw.mock.calls.some((c) => /UPDATE/.test(sqlOf(c[0])))).toBe(false);
  });

  it("saves the category under its list spelling (adding it while the list is open)", async () => {
    vi.mocked(resolveCategoryForSave).mockResolvedValue({ name: "Payroll", isNew: false });
    const res = await patch({ categoryOverride: "pay roll" });
    expect(res.status).toBe(200);
    expect(resolveCategoryForSave).toHaveBeenCalledWith("pay roll", { isAdmin: true, by: "admin@pmi.com" });
    const update = executeRaw.mock.calls.find((c) => /UPDATE plaid_transactions/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(update.values[0]).toBe("Payroll");
  });

  it("rejects a category that isn't on the locked list", async () => {
    vi.mocked(resolveCategoryForSave).mockResolvedValue({ error: "Not an approved category." });
    const res = await patch({ categoryOverride: "Snacks" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Not an approved category." });
    expect(executeRaw.mock.calls.some((c) => /UPDATE plaid_transactions/.test(sqlOf(c[0])))).toBe(false);
  });
});
