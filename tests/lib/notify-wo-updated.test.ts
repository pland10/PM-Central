import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notification-prefs-db", () => ({ hasCategory: vi.fn() }));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn(async () => ({ sent: 1, pruned: 0 })) }));

import { hasCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser } from "@/lib/push-send";
import { notifyWorkOrderNote } from "@/lib/notify-wo-updated";

const tech = { email: "Ari@PMI.com", name: "Ari" };

beforeEach(() => vi.mocked(hasCategory).mockResolvedValue(true));
afterEach(() => vi.clearAllMocks());

describe("notifyWorkOrderNote", () => {
  it("pushes the assigned tech (by email) with a trimmed snippet", async () => {
    const r = await notifyWorkOrderNote({ tech, woId: "999", woNumber: "4567", byEmail: "office@pmi.com", body: "  Tenant will be home after 5pm  " });
    expect(r.notified).toBe(true);
    expect(hasCategory).toHaveBeenCalledWith("ari@pmi.com", "wo_assigned");
    const [[userId, email, payload]] = vi.mocked(sendPushToUser).mock.calls;
    expect(userId).toBeNull();
    expect(email).toBe("ari@pmi.com");
    expect(payload.body).toContain("#4567");
    expect(payload.body).toContain("Tenant will be home after 5pm");
  });

  it("does nothing when the tech wrote the note themselves", async () => {
    const r = await notifyWorkOrderNote({ tech, woId: "999", woNumber: "4567", byEmail: "ARI@pmi.com", body: "my own note" });
    expect(r.notified).toBe(false);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("does nothing when the tech hasn't opted in", async () => {
    vi.mocked(hasCategory).mockResolvedValue(false);
    const r = await notifyWorkOrderNote({ tech, woId: "999", woNumber: "4567", byEmail: "office@pmi.com", body: "hi" });
    expect(r.notified).toBe(false);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("never throws if the push layer fails", async () => {
    vi.mocked(sendPushToUser).mockRejectedValue(new Error("boom"));
    const r = await notifyWorkOrderNote({ tech, woId: "999", woNumber: null, byEmail: "office@pmi.com", body: "hi" });
    expect(r.notified).toBe(false);
  });
});
