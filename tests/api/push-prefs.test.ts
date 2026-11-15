import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notification-prefs-db", () => ({
  getEnabledCategories: vi.fn(async () => ["wo_assigned"]),
  setCategory: vi.fn(async () => {}),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { setCategory } from "@/lib/notification-prefs-db";
import { GET, POST } from "@/app/api/push/prefs/route";

const post = (body: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/push/prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const asUser = (role: string) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role } as never);

beforeEach(() => asUser("user"));
afterEach(() => vi.clearAllMocks());

describe("/api/push/prefs", () => {
  it("GET returns the role's catalog + enabled set", async () => {
    const d = await (await GET()).json();
    expect(d.enabled).toEqual(["wo_assigned"]);
    const keys = d.categories.map((c: { key: string }) => c.key);
    expect(keys).toContain("wo_assigned");
    expect(keys).not.toContain("payment_nsf"); // non-admin
  });

  it("admins see admin-only categories", async () => {
    asUser("admin");
    const d = await (await GET()).json();
    expect(d.categories.map((c: { key: string }) => c.key)).toContain("payment_nsf");
  });

  it("POST saves an allowed category", async () => {
    const res = await POST(post({ category: "wo_assigned", enabled: true }));
    expect(res.status).toBe(200);
    expect(setCategory).toHaveBeenCalledWith("a@b.com", "wo_assigned", true);
  });

  it("POST 403s a non-admin enabling an admin-only category", async () => {
    const res = await POST(post({ category: "payment_nsf", enabled: true }));
    expect(res.status).toBe(403);
    expect(setCategory).not.toHaveBeenCalled();
  });

  it("POST 400s a bad body and 401s when logged out", async () => {
    expect((await POST(post({ category: "wo_assigned" }))).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(post({ category: "wo_assigned", enabled: true }))).status).toBe(401);
  });
});
