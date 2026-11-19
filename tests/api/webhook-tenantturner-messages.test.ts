import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { tag: "db" } }));
vi.mock("@/lib/tenantturner/messages-db", () => ({ saveTtMessages: vi.fn() }));

import { saveTtMessages } from "@/lib/tenantturner/messages-db";
import { POST } from "@/app/api/webhooks/tenantturner-messages/route";

const email = (id: string, subject = "New message from Ann Lee", text = "Got it") => ({
  id,
  date: "2026-11-19T13:39:41.000Z",
  subject,
  body: `Hi Paul,\n\nYou have a new unread message from Ann Lee waiting for you in your PMI Lighthouse account.\n\n"${text}"\n\nhttps://tracking.example/x`,
});
const post = (body: unknown, auth = "Bearer s3cret") =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/webhooks/tenantturner-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: auth },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.stubEnv("TT_MESSAGES_SECRET", "s3cret");
  vi.mocked(saveTtMessages).mockImplementation(async (_p, rows) => rows.length);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/webhooks/tenantturner-messages", () => {
  it("needs the shared secret, and is off until it's set", async () => {
    expect((await post({ messages: [] }, "Bearer nope")).status).toBe(401);
    vi.stubEnv("TT_MESSAGES_SECRET", "");
    expect((await post({ messages: [] })).status).toBe(401);
    expect(saveTtMessages).not.toHaveBeenCalled();
  });

  it("parses each Tenant Turner email and stores the replies, skipping anything else", async () => {
    const res = await post({ messages: [email("g1"), email("g2", "Tenant Turner Feature Spotlight"), { id: 5 }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, received: 3, parsed: 1, stored: 1 });
    expect(saveTtMessages).toHaveBeenCalledWith({ tag: "db" }, [
      { gmailId: "g1", receivedAt: new Date("2026-11-19T13:39:41.000Z"), leadName: "Ann Lee", agentName: "Paul", text: "Got it" },
    ]);
  });

  it("400s without a messages list, and caps a batch at 100", async () => {
    expect((await post({})).status).toBe(400);
    const many = Array.from({ length: 120 }, (_, i) => email(`g${i}`));
    expect(await (await post({ messages: many })).json()).toMatchObject({ received: 100, parsed: 100 });
  });
});
