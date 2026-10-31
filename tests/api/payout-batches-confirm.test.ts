import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/payout-batches", () => ({ confirmPayoutBatch: vi.fn() }));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { confirmPayoutBatch } from "@/lib/payout-batches";
import { POST } from "@/app/api/accounting/payout-batches/confirm/route";

const confirm = vi.mocked(confirmPayoutBatch);
const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/accounting/payout-batches/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  confirm.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/accounting/payout-batches/confirm", () => {
  it("confirms a batch", async () => {
    const res = await post({ batchId: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, batchId: 7 });
    expect(confirm).toHaveBeenCalledWith({}, 7, "admin@pmi.com");
  });

  it("400s without a batchId, 409 when already confirmed / gone", async () => {
    expect((await post({})).status).toBe(400);
    confirm.mockResolvedValue(false);
    expect((await post({ batchId: 7 })).status).toBe(409);
  });

  it("404s when the feature is off or the user can't access accounting", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await post({ batchId: 7 })).status).toBe(404);
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ batchId: 7 })).status).toBe(404);
  });
});
