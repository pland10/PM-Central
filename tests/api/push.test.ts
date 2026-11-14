import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/push-db", () => ({
  saveSubscription: vi.fn(async () => {}),
  getVapidPublicKey: vi.fn(async () => "PUBKEY"),
}));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getVapidPublicKey, saveSubscription } from "@/lib/push-db";
import { sendPushToUser } from "@/lib/push-send";
import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as testPush } from "@/app/api/push/test/route";
import { GET as publicKey } from "@/app/api/push/public-key/route";

const user = { id: "u1", email: "a@b.com", role: "admin" };
beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(user as never));
afterEach(() => vi.clearAllMocks());

const post = (body: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "jsdom" },
    body: JSON.stringify(body),
  });

describe("push API", () => {
  it("public-key returns the VAPID key, 401 when logged out", async () => {
    expect(await (await publicKey()).json()).toEqual({ key: "PUBKEY" });
    expect(getVapidPublicKey).toHaveBeenCalled();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await publicKey()).status).toBe(401);
  });

  it("subscribe saves a valid subscription for the current user", async () => {
    const res = await subscribe(post({ endpoint: "https://push/e1", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(201);
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", userEmail: "a@b.com", endpoint: "https://push/e1", p256dh: "p", auth: "a" })
    );
  });

  it("subscribe rejects a malformed body and requires auth", async () => {
    expect((await subscribe(post({ endpoint: "e" }))).status).toBe(400);
    expect(saveSubscription).not.toHaveBeenCalled();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await subscribe(post({ endpoint: "e", keys: { p256dh: "p", auth: "a" } }))).status).toBe(401);
  });

  it("test sends a notification to the user's devices", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 2, pruned: 0 });
    expect(await (await testPush()).json()).toMatchObject({ ok: true, sent: 2 });
    expect(sendPushToUser).toHaveBeenCalledWith("u1", "a@b.com", expect.objectContaining({ title: "PM Central" }));
  });

  it("test reports when no device is subscribed", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, pruned: 0 });
    expect(await (await testPush()).json()).toMatchObject({ ok: false, sent: 0 });
  });
});
