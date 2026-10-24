import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/showings", () => ({ applyTenantTurnerEvent: vi.fn() }));

import { applyTenantTurnerEvent } from "@/lib/showings";
import { GET, POST } from "@/app/api/webhooks/tenantturner/route";

const SECRET = "s3cret-webhook-key";
const apply = vi.mocked(applyTenantTurnerEvent);

function post(query = "", { body = '{"event":"showing.created"}', headers = {} as Record<string, string> } = {}) {
  return new NextRequest(`https://pmilighthouse.app/api/webhooks/tenantturner${query}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.stubEnv("TENANT_TURNER_WEBHOOK_SECRET", SECRET);
  apply.mockResolvedValue({ action: "created" } as never);
});

describe("POST /api/webhooks/tenantturner", () => {
  it("accepts the secret in ?key= and applies the event", async () => {
    const res = await POST(post(`?key=${SECRET}`));

    expect(res.status).toBe(200);
    expect(apply).toHaveBeenCalledWith({ event: "showing.created" });
    expect(await res.json()).toEqual({ action: "created" });
  });

  it("accepts the secret as a Bearer token", async () => {
    const res = await POST(post("", { headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
  });

  it.each([
    ["no key", ""],
    ["a wrong key of the same length", `?key=${"x".repeat(SECRET.length)}`],
    ["a wrong key of another length", "?key=short"],
  ])("rejects %s with 401 without touching the database", async (_label, query) => {
    const res = await POST(post(query));
    expect(res.status).toBe(401);
    expect(apply).not.toHaveBeenCalled();
  });

  it("locks everything down when the secret isn't configured", async () => {
    vi.stubEnv("TENANT_TURNER_WEBHOOK_SECRET", "");
    const res = await POST(post("?key="));
    expect(res.status).toBe(401);
  });

  it("rejects a body that isn't JSON with 400", async () => {
    const res = await POST(post(`?key=${SECRET}`, { body: "not json" }));
    expect(res.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("returns 500 when applying the event fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apply.mockRejectedValue(new Error("db down"));

    const res = await POST(post(`?key=${SECRET}`));

    expect(res.status).toBe(500);
  });
});

describe("GET /api/webhooks/tenantturner", () => {
  it("confirms readiness only with the right secret", async () => {
    const ok = await GET(new NextRequest(`https://pmilighthouse.app/api/webhooks/tenantturner?key=${SECRET}`));
    const denied = await GET(new NextRequest("https://pmilighthouse.app/api/webhooks/tenantturner?key=nope"));

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, endpoint: "tenantturner", ready: true });
    expect(denied.status).toBe(401);
  });
});
