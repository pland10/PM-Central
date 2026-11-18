import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/meetings-db", () => ({ savePropertyOrder: vi.fn(async () => {}) }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { savePropertyOrder } from "@/lib/meetings-db";
import { POST } from "@/app/api/admin/property-order/route";

const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/admin/property-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "admin" } as never));
afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/property-order", () => {
  it("saves the ordered id list (admin)", async () => {
    const res = await post({ ids: ["p3", "p1", "p2"] });
    expect(res.status).toBe(200);
    expect(savePropertyOrder).toHaveBeenCalledWith(["p3", "p1", "p2"]);
  });

  it("rejects a non-array / non-string ids, and gates non-admins", async () => {
    expect((await post({ ids: "nope" })).status).toBe(400);
    expect((await post({ ids: ["p1", 2] })).status).toBe(400);
    expect(savePropertyOrder).not.toHaveBeenCalled();

    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "user" } as never);
    expect((await post({ ids: ["p1"] })).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post({ ids: ["p1"] })).status).toBe(401);
  });
});
