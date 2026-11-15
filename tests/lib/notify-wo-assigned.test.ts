import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notification-prefs-db", () => ({ hasCategory: vi.fn() }));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn(async () => ({ sent: 1, pruned: 0 })) }));

import { hasCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser } from "@/lib/push-send";
import { notifyWorkOrderAssigned } from "@/lib/notify-wo-assigned";

const tech = { email: "Ari@PMI.com", name: "Ari" };

beforeEach(() => vi.mocked(hasCategory).mockResolvedValue(true));
afterEach(() => vi.clearAllMocks());

describe("notifyWorkOrderAssigned", () => {
  it("pushes to the tech (by email, case-insensitive) when they've opted in", async () => {
    const r = await notifyWorkOrderAssigned({ tech, woId: "123", woNumber: "4567", byEmail: "dispatch@pmi.com", previousTechEmail: null });
    expect(r.notified).toBe(true);
    expect(hasCategory).toHaveBeenCalledWith("ari@pmi.com", "wo_assigned");
    const [[userId, email, payload]] = vi.mocked(sendPushToUser).mock.calls;
    expect(userId).toBeNull();
    expect(email).toBe("ari@pmi.com");
    expect(payload.title).toMatch(/work order/i);
    expect(payload.body).toContain("4567");
    expect(payload.url).toBe("/maintenance");
  });

  it("does nothing when the tech hasn't opted in", async () => {
    vi.mocked(hasCategory).mockResolvedValue(false);
    const r = await notifyWorkOrderAssigned({ tech, woId: "123", woNumber: "4567", byEmail: "x@pmi.com", previousTechEmail: null });
    expect(r.notified).toBe(false);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("skips when the assignment didn't change (same tech already on it)", async () => {
    const r = await notifyWorkOrderAssigned({ tech, woId: "123", woNumber: "4567", byEmail: "x@pmi.com", previousTechEmail: "ari@pmi.com" });
    expect(r.notified).toBe(false);
    expect(hasCategory).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("skips self-assignment (the person assigning is the tech)", async () => {
    const r = await notifyWorkOrderAssigned({ tech, woId: "123", woNumber: "4567", byEmail: "ARI@pmi.com", previousTechEmail: null });
    expect(r.notified).toBe(false);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("never throws if the push layer fails", async () => {
    vi.mocked(sendPushToUser).mockRejectedValue(new Error("boom"));
    const r = await notifyWorkOrderAssigned({ tech, woId: "123", woNumber: null, byEmail: "x@pmi.com", previousTechEmail: null });
    expect(r.notified).toBe(false);
  });
});
