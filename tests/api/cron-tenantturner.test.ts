import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { tag: "db" } }));
vi.mock("@/lib/tenantturner/sync", () => ({ runTenantTurnerSync: vi.fn() }));
vi.mock("@/lib/tenantturner/sync-live", () => ({ liveTenantTurnerDeps: vi.fn(() => ({ deps: true })) }));

import { runTenantTurnerSync } from "@/lib/tenantturner/sync";
import { liveTenantTurnerDeps } from "@/lib/tenantturner/sync-live";
import { GET } from "@/app/api/cron/tenantturner/route";

const call = (auth?: string) =>
  GET(new NextRequest("https://pmilighthouse.app/api/cron/tenantturner?slot=day", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("TENANT_TURNER_API_KEY", "tt-key");
  vi.mocked(runTenantTurnerSync).mockResolvedValue({ since: "2026-11-01T00:00:00.000Z", applications: 3, showings: 4, linked: 2, failed: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/tenantturner", () => {
  it("needs the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect(runTenantTurnerSync).not.toHaveBeenCalled();
  });

  it("pulls changed showings from Tenant Turner and reports the counts", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, since: "2026-11-01T00:00:00.000Z", applications: 3, showings: 4, linked: 2, failed: 0 });
    expect(liveTenantTurnerDeps).toHaveBeenCalledWith({ tag: "db" });
    expect(runTenantTurnerSync).toHaveBeenCalledWith({ deps: true });
  });

  it("skips quietly without a Tenant Turner API key", async () => {
    vi.stubEnv("TENANT_TURNER_API_KEY", "");
    const res = await call("Bearer s3cret");
    expect(await res.json()).toEqual({ ok: false, skipped: "TENANT_TURNER_API_KEY not set" });
    expect(runTenantTurnerSync).not.toHaveBeenCalled();
  });

  it("502s with the error when the sync fails", async () => {
    vi.mocked(runTenantTurnerSync).mockRejectedValue(new Error("Tenant Turner GET /v1/properties -> HTTP 401"));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Tenant Turner GET /v1/properties -> HTTP 401" });
  });
});
