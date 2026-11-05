import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/text-alerts", () => ({ runTextAlerts: vi.fn() }));
vi.mock("@/lib/text-alerts-live", () => ({ liveTextAlertDeps: vi.fn(() => ({})), textAlertConfig: vi.fn() }));

import { runTextAlerts } from "@/lib/text-alerts";
import { textAlertConfig } from "@/lib/text-alerts-live";
import { GET } from "@/app/api/cron/text-alerts/route";

const call = (auth?: string) =>
  GET(new NextRequest("https://pmilighthouse.app/api/cron/text-alerts", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.mocked(textAlertConfig).mockReturnValue({ apiKey: "ls", recipients: ["info@pmilighthouse.com"] });
  vi.mocked(runTextAlerts).mockResolvedValue({ sent: 2, watchingFrom: "2026-11-05T15:20:00Z" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/text-alerts", () => {
  it("needs the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(runTextAlerts).not.toHaveBeenCalled();
  });

  it("runs the alerts and reports what was sent", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 2, watchingFrom: "2026-11-05T15:20:00Z" });
  });

  it("no-ops until the LeadSimple key is set, and reports a failure as 502", async () => {
    vi.mocked(textAlertConfig).mockReturnValueOnce({ apiKey: "", recipients: [] });
    expect(await (await call("Bearer s3cret")).json()).toEqual({ ok: false, skipped: "LEADSIMPLE_API_KEY not set" });
    vi.mocked(runTextAlerts).mockRejectedValueOnce(new Error("LeadSimple /text_messages HTTP 401"));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/HTTP 401/);
  });
});
