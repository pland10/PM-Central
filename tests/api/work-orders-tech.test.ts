import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn(async () => [{ email: "ari@pmi.com", name: "Ari" }]) }));
vi.mock("@/lib/created-work-orders", () => ({ resolveWorkOrderId: vi.fn(async () => "wo-999") }));
vi.mock("@/lib/work-order-tech-db", () => ({ getTech: vi.fn(async () => null), setTech: vi.fn(async () => {}) }));
vi.mock("@/lib/notify-wo-assigned", () => ({ notifyWorkOrderAssigned: vi.fn(async () => ({ notified: true })) }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getTech, setTech } from "@/lib/work-order-tech-db";
import { notifyWorkOrderAssigned } from "@/lib/notify-wo-assigned";
import { POST } from "@/app/api/work-orders/tech/route";

const post = (body: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/work-orders/tech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "dispatch@pmi.com", role: "user" } as never);
  vi.mocked(getTech).mockResolvedValue({ email: "old@pmi.com", name: "Old" });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/work-orders/tech", () => {
  it("assigns and notifies the new tech, passing the previous tech + number", async () => {
    const res = await POST(post({ woId: "pmc:4567", techEmail: "ari@pmi.com", woNumber: "4567" }));
    expect(res.status).toBe(200);
    expect(setTech).toHaveBeenCalledWith("wo-999", { email: "ari@pmi.com", name: "Ari" }, "dispatch@pmi.com");
    expect(notifyWorkOrderAssigned).toHaveBeenCalledWith({
      tech: { email: "ari@pmi.com", name: "Ari" },
      woId: "wo-999",
      woNumber: "4567",
      byEmail: "dispatch@pmi.com",
      previousTechEmail: "old@pmi.com",
    });
  });

  it("does not notify when clearing the tech", async () => {
    const res = await POST(post({ woId: "pmc:4567", techEmail: null }));
    expect(res.status).toBe(200);
    expect(setTech).toHaveBeenCalledWith("wo-999", null, "dispatch@pmi.com");
    expect(notifyWorkOrderAssigned).not.toHaveBeenCalled();
  });

  it("401s when logged out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(post({ woId: "x", techEmail: "ari@pmi.com" }))).status).toBe(401);
  });
});
