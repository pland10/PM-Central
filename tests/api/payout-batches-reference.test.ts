import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/payout-batches", async (orig) => ({
  ...(await orig<typeof import("@/lib/payout-batches")>()),
  setBatchReference: vi.fn(),
}));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { setBatchReference } from "@/lib/payout-batches";
import { POST } from "@/app/api/accounting/payout-batches/reference/route";

const setRef = vi.mocked(setBatchReference);
const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/accounting/payout-batches/reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  setRef.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/accounting/payout-batches/reference", () => {
  it("saves a confirmed batch's Chase transaction #, trimmed", async () => {
    const res = await post({ batchId: 7, bankReference: "  CHS-2 " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, batchId: 7, bankReference: "CHS-2" });
    expect(setRef).toHaveBeenCalledWith({}, 7, "CHS-2");
  });

  it("clears it when blank", async () => {
    await post({ batchId: 7, bankReference: "  " });
    expect(setRef).toHaveBeenCalledWith({}, 7, null);
  });

  it("400s without a batchId or on a too-long #, 409 when the batch isn't confirmed / is gone", async () => {
    expect((await post({ bankReference: "x" })).status).toBe(400);
    expect((await post({ batchId: 7, bankReference: "x".repeat(101) })).status).toBe(400);
    expect(setRef).not.toHaveBeenCalled();
    setRef.mockResolvedValue(false);
    expect((await post({ batchId: 7, bankReference: "x" })).status).toBe(409);
  });

  it("404s when the feature is off or the user can't access accounting", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await post({ batchId: 7, bankReference: "x" })).status).toBe(404);
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ batchId: 7, bankReference: "x" })).status).toBe(404);
    expect(setRef).not.toHaveBeenCalled();
  });
});
