import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $transaction: vi.fn() },
}));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/plaid/transactions/[transactionId]/review/route";

const executeRaw = vi.mocked(prisma.$executeRaw);
const sqls = () => executeRaw.mock.calls.map((c) => sqlOf(c[0]));

function post(body: unknown, id = "pend1") {
  return POST(
    new NextRequest(`https://pmilighthouse.app/api/plaid/transactions/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ transactionId: id }) }
  );
}

beforeEach(() => {
  executeRaw.mockResolvedValue(1);
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]) as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/plaid/transactions/:id/review", () => {
  it("dismisses a dropped pending charge — deletes only a row that's in review", async () => {
    const res = await post({ action: "dismiss" });
    expect(res.status).toBe(200);
    const del = sqls().find((s) => /DELETE FROM plaid_transactions/.test(s))!;
    expect(del).toMatch(/review_reason = 'pending_dropped'/);
    // its notes thread goes with it
    expect(sqls().some((s) => /DELETE FROM transaction_notes/.test(s))).toBe(true);
  });

  it("moves the edits onto the chosen posted charge, then removes the dropped one", async () => {
    const res = await post({ action: "move", targetId: "post9" });
    expect(res.status).toBe(200);
    const all = sqls();
    const copy = all.findIndex((s) => /UPDATE plaid_transactions t SET/.test(s));
    const del = all.findIndex((s) => /DELETE FROM plaid_transactions/.test(s));
    expect(all[copy]).toMatch(/reimbursable = COALESCE\(t\.reimbursable, p\.reimbursable\)/);
    expect(all[copy]).toMatch(/t\.pending = false/); // never onto another pending row
    expect(all[copy]).toMatch(/p\.review_reason = 'pending_dropped'/);
    expect(del).toBeGreaterThan(copy);
    // the notes thread moves to the chosen charge too, before the dropped row goes
    const notes = all.findIndex((s) => /UPDATE transaction_notes SET transaction_id/.test(s));
    expect(notes).toBeGreaterThan(-1);
    expect(notes).toBeLessThan(del);
  });

  it("clears an amount-changed flag once someone has looked", async () => {
    await post({ action: "ok" }, "post9");
    const upd = sqls().find((s) => /SET review_reason = NULL/.test(s))!;
    expect(upd).toMatch(/review_reason = 'amount_changed'/);
  });

  it("404s when nothing matched, and 400s on an unknown action or a move without a target", async () => {
    executeRaw.mockResolvedValue(0);
    expect((await post({ action: "dismiss" })).status).toBe(404);
    expect((await post({ action: "nope" })).status).toBe(400);
    expect((await post({ action: "move" })).status).toBe(400);
  });

  it("404s for a user who can't access accounting", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ action: "dismiss" })).status).toBe(404);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
