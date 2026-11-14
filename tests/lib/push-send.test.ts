import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => {
  const m = { setVapidDetails: vi.fn(), sendNotification: vi.fn(), generateVAPIDKeys: vi.fn() };
  return { default: m, ...m };
});
vi.mock("@/lib/push-db", () => ({
  getVapidKeys: vi.fn(async () => ({ publicKey: "pub", privateKey: "priv" })),
  listSubscriptions: vi.fn(),
  deleteSubscription: vi.fn(async () => {}),
}));

import webpush from "web-push";
import { deleteSubscription, listSubscriptions } from "@/lib/push-db";
import { sendPushToUser } from "@/lib/push-send";

const sub = (endpoint: string) => ({ endpoint, p256dh: "p", auth: "a" });

beforeEach(() => vi.clearAllMocks());

describe("sendPushToUser", () => {
  it("sets VAPID and pushes to every device with a JSON payload", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue([sub("e1"), sub("e2")]);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    const r = await sendPushToUser("u1", "a@b.com", { title: "T", body: "B", url: "/x" });

    expect(webpush.setVapidDetails).toHaveBeenCalledWith("mailto:notifications@pmilighthouse.app", "pub", "priv");
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const [target, payload] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect((target as { endpoint: string }).endpoint).toBe("e1");
    expect(JSON.parse(payload as string)).toMatchObject({ title: "T", body: "B", url: "/x" });
    expect(r).toEqual({ sent: 2, pruned: 0 });
  });

  it("prunes an expired subscription (410/404) and counts it", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue([sub("live"), sub("dead")]);
    vi.mocked(webpush.sendNotification).mockImplementation(async (t: unknown) => {
      if ((t as { endpoint: string }).endpoint === "dead") {
        const e = Object.assign(new Error("gone"), { statusCode: 410 });
        throw e;
      }
      return {} as never;
    });

    const r = await sendPushToUser("u1", "a@b.com", { title: "T" });
    expect(deleteSubscription).toHaveBeenCalledWith("dead");
    expect(r).toEqual({ sent: 1, pruned: 1 });
  });

  it("never throws, even if lookups fail", async () => {
    vi.mocked(listSubscriptions).mockRejectedValue(new Error("db down"));
    await expect(sendPushToUser("u1", "a@b.com", { title: "T" })).resolves.toEqual({ sent: 0, pruned: 0 });
  });
});
