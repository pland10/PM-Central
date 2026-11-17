import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/admin-gate", () => ({ requireAdminUser: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ cronAuthorized: vi.fn(() => true) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn(async () => []) }));
vi.mock("@/lib/calendar/db", () => ({
  getDigestRecipients: vi.fn(),
  setDigestRecipients: vi.fn(),
  claimDigestSend: vi.fn(),
  releaseDigestSend: vi.fn(),
}));
vi.mock("@/lib/calendar/daily-summary-live", () => ({ gatherDailySummary: vi.fn() }));

import { isFeatureEnabled } from "@/config/features";
import { requireAdminUser } from "@/lib/admin-gate";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { claimDigestSend, getDigestRecipients, releaseDigestSend, setDigestRecipients } from "@/lib/calendar/db";
import { gatherDailySummary } from "@/lib/calendar/daily-summary-live";
import { GET as getSettings, PUT as putSettings } from "@/app/api/calendar/settings/route";
import { POST as sendNow } from "@/app/api/calendar/digest/route";
import { GET as cron } from "@/app/api/cron/daily-summary/route";

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`https://pmilighthouse.app${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const DATA = { date: "2026-11-18", dueToday: [], overdue: [], workOrders: [], returnedPayments: [], draws: null, syncProblems: [] };

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(requireAdminUser).mockResolvedValue({ user: { id: "u1", email: "paul@pmi.com", role: "admin" } } as never);
  vi.mocked(getDigestRecipients).mockResolvedValue(["paul@pmi.com"]);
  vi.mocked(claimDigestSend).mockResolvedValue(true);
  vi.mocked(gatherDailySummary).mockResolvedValue(DATA);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e1" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("/api/calendar/settings (admin)", () => {
  it("reads and saves the summary recipients", async () => {
    expect(await (await getSettings()).json()).toEqual({ digestTo: ["paul@pmi.com"] });
    const res = await putSettings(req("/api/calendar/settings", "PUT", { digestTo: "Paul@PMI.com, ari@pmi.com" }));
    expect(res.status).toBe(200);
    expect(setDigestRecipients).toHaveBeenCalledWith({}, ["paul@pmi.com", "ari@pmi.com"]);
  });

  it("rejects a bad address, and non-admins", async () => {
    expect((await putSettings(req("/api/calendar/settings", "PUT", { digestTo: "nope" }))).status).toBe(400);
    vi.mocked(requireAdminUser).mockResolvedValueOnce({ error: "Admins only", status: 403 } as never);
    expect((await getSettings()).status).toBe(403);
  });
});

describe("POST /api/calendar/digest (Send now, admin)", () => {
  it("sends today's summary to the recipients now", async () => {
    const res = await sendNow(req("/api/calendar/digest", "POST"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sentTo: ["paul@pmi.com"] });
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toEqual(["paul@pmi.com"]);
    expect(mail.subject).toMatch(/PM Central daily summary/);
    expect(mail.html).toContain("https://pmilighthouse.app/calendar");
  });

  it("needs recipients, and reports a failed send", async () => {
    vi.mocked(getDigestRecipients).mockResolvedValueOnce([]);
    expect((await sendNow(req("/api/calendar/digest", "POST"))).status).toBe(400);
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, status: 503, error: "Email isn't configured" });
    expect((await sendNow(req("/api/calendar/digest", "POST"))).status).toBe(502);
  });
});

describe("GET /api/cron/daily-summary", () => {
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  it("sends once at 6am ET on a business day", async () => {
    at("2026-11-18T11:00:00Z"); // Wed 6am EST
    const res = await cron(req("/api/cron/daily-summary"));
    expect(await res.json()).toMatchObject({ ok: true, sent: true });
    expect(claimDigestSend).toHaveBeenCalledWith({}, "2026-11-18");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips (without touching the database) outside the 6am ET hour", async () => {
    at("2026-11-18T10:00:00Z"); // 5am EST — the other scheduled run
    expect(await (await cron(req("/api/cron/daily-summary"))).json()).toMatchObject({ ok: true, sent: false });
    expect(getDigestRecipients).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when already sent today or nobody's set up", async () => {
    at("2026-11-18T11:00:00Z");
    vi.mocked(claimDigestSend).mockResolvedValueOnce(false);
    expect(await (await cron(req("/api/cron/daily-summary"))).json()).toMatchObject({ sent: false });
    vi.mocked(getDigestRecipients).mockResolvedValueOnce([]);
    expect(await (await cron(req("/api/cron/daily-summary"))).json()).toMatchObject({ sent: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("releases the day if the email fails, and needs the cron secret", async () => {
    at("2026-11-18T11:00:00Z");
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, status: 502, error: "Resend down" });
    expect((await cron(req("/api/cron/daily-summary"))).status).toBe(502);
    expect(releaseDigestSend).toHaveBeenCalledWith({}, "2026-11-18");
    vi.mocked(cronAuthorized).mockReturnValueOnce(false);
    expect((await cron(req("/api/cron/daily-summary"))).status).toBe(401);
  });
});
