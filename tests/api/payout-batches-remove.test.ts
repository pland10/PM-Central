import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/payout-batches", () => ({ removeBatchItem: vi.fn() }));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { removeBatchItem } from "@/lib/payout-batches";
import { POST } from "@/app/api/accounting/payout-batches/remove/route";

const remove = vi.mocked(removeBatchItem);
const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/accounting/payout-batches/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  remove.mockResolvedValue({ removed: { payoutId: "c", amount: 999, bankAccount: "Residential Trust", batchId: 3 }, batchEmptied: true });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/accounting/payout-batches/remove", () => {
  it("removes an item and returns what to move back", async () => {
    const res = await post({ payoutId: "c" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, removed: { amount: 999, bankAccount: "Residential Trust" }, batchEmptied: true });
    expect(remove).toHaveBeenCalledWith({}, "c");
  });

  it("400s without a payoutId, 404s when it isn't in a batch", async () => {
    expect((await post({})).status).toBe(400);
    remove.mockResolvedValue({ removed: null, batchEmptied: false });
    expect((await post({ payoutId: "x" })).status).toBe(404);
  });

  it("404s when the feature is off or the user can't access accounting", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await post({ payoutId: "c" })).status).toBe(404);
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ payoutId: "c" })).status).toBe(404);
  });
});
