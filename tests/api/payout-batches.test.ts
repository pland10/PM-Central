import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/payout-batches", () => ({ createPayoutBatch: vi.fn() }));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { createPayoutBatch } from "@/lib/payout-batches";
import { POST } from "@/app/api/accounting/payout-batches/route";

const create = vi.mocked(createPayoutBatch);

function post(body: unknown) {
  return POST(
    new NextRequest("https://pmilighthouse.app/api/accounting/payout-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  create.mockResolvedValue({ batchId: 5, count: 2, total: 150, skipped: [] });
});
afterEach(() => vi.clearAllMocks());

const items = [
  { payoutId: "a", amount: 100, payee: "PMI Lighthouse", postedDate: "2026-08-01", memo: "fees" },
  { payoutId: "b", amount: 50, payee: "PMI Lighthouse Reimbursable" },
];

describe("POST /api/accounting/payout-batches", () => {
  it("locks a batch and returns its summary", async () => {
    const res = await post({ items, note: "august" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, batchId: 5, count: 2, total: 150 });
    expect(create).toHaveBeenCalledWith(
      {},
      expect.arrayContaining([expect.objectContaining({ payoutId: "a", amount: 100 })]),
      { note: "august", by: "admin@pmi.com" }
    );
  });

  it("drops malformed items and rejects an empty selection", async () => {
    const res = await post({ items: [{ amount: 10 }, { payoutId: "" }, "nope"] });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("409s when everything was already batched", async () => {
    create.mockResolvedValue({ batchId: null, count: 0, total: 0, skipped: ["a", "b"] });
    const res = await post({ items });
    expect(res.status).toBe(409);
  });

  it("404s when the feature is off or the user can't access accounting", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await post({ items })).status).toBe(404);

    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ items })).status).toBe(404);

    expect(create).not.toHaveBeenCalled();
  });
});
