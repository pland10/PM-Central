import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push-alerts", () => ({ runPushAlerts: vi.fn() }));
vi.mock("@/lib/push-alerts-live", () => ({ livePushAlertDeps: vi.fn(() => ({})) }));

import { runPushAlerts } from "@/lib/push-alerts";
import { GET } from "@/app/api/cron/push-alerts/route";

const call = (auth?: string) =>
  GET(new NextRequest("https://pmilighthouse.app/api/cron/push-alerts", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.mocked(runPushAlerts).mockResolvedValue({ nsf: 1, wo: 2, sync: 0, updates: 0, draws: 1 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/push-alerts", () => {
  it("needs the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(runPushAlerts).not.toHaveBeenCalled();
  });

  it("runs the alerts and reports counts", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, nsf: 1, wo: 2, sync: 0, updates: 0, draws: 1 });
  });

  it("reports a failure as 502", async () => {
    vi.mocked(runPushAlerts).mockRejectedValueOnce(new Error("db down"));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/db down/);
  });
});
