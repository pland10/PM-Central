import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/accounting", () => ({ fetchManagementDraws: vi.fn() }));
vi.mock("@/lib/payout-batches", () => ({ batchedPayoutIds: vi.fn() }));
vi.mock("@/lib/notification-prefs-db", () => ({ emailsForCategory: vi.fn() }));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/sync-status", () => ({ getSyncStatusMap: vi.fn() }));
vi.mock("@/lib/work-orders-dashboard", () => ({ attentionList: vi.fn(), workOrderAlerts: vi.fn() }));
vi.mock("@/lib/calendar/db", () => ({ listCalendarEvents: vi.fn(), listTaskStatuses: vi.fn() }));

import { listCalendarEvents, listTaskStatuses } from "@/lib/calendar/db";
import { livePushAlertDeps } from "@/lib/push-alerts-live";

const ev = (over: Record<string, unknown>) => ({
  id: 1, title: "Reimbursables review", description: "", rule: "ME-5", frequency: "monthly", month: null,
  adjust: "prior", ownerEmail: "ari@pmi.com", ownerName: "Ari", active: true, ...over,
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("livePushAlertDeps().calendarDueToday", () => {
  it("lists owned, active, not-done tasks dated today (Eastern), from 7am", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T14:00:00Z")); // 9am ET, Wed Nov 25 — ME-5
    vi.mocked(listCalendarEvents).mockResolvedValue([
      ev({}),
      ev({ id: 2, ownerEmail: null }), // no owner
      ev({ id: 3, active: false }), // switched off
      ev({ id: 4, title: "Done already" }),
      ev({ id: 5, rule: "D10" }), // not today
    ] as never);
    vi.mocked(listTaskStatuses).mockResolvedValue({ "4:2026-11": { doneBy: "a", doneByName: "A", doneAt: "x" } });
    expect(await livePushAlertDeps().calendarDueToday()).toEqual([
      { eventId: 1, period: "2026-11", title: "Reimbursables review", rule: "ME-5", ownerEmail: "ari@pmi.com" },
    ]);
  });

  it("includes a daily task every business day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T14:00:00Z")); // 9am ET Tue Nov 24
    vi.mocked(listCalendarEvents).mockResolvedValue([ev({ id: 7, title: "Check bank feed", rule: "DAILY", frequency: "daily" })] as never);
    vi.mocked(listTaskStatuses).mockResolvedValue({});
    expect(await livePushAlertDeps().calendarDueToday()).toEqual([
      { eventId: 7, period: "2026-11-24", title: "Check bank feed", rule: "DAILY", ownerEmail: "ari@pmi.com" },
    ]);
    expect(listTaskStatuses).toHaveBeenCalledWith({}, ["2026-11"]); // looked up by month
  });

  it("waits until 7am Eastern, and is empty if the calendar can't be read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z")); // 5am ET
    vi.mocked(listCalendarEvents).mockResolvedValue([ev({})] as never);
    vi.mocked(listTaskStatuses).mockResolvedValue({});
    expect(await livePushAlertDeps().calendarDueToday()).toEqual([]);

    vi.setSystemTime(new Date("2026-11-25T14:00:00Z"));
    vi.mocked(listCalendarEvents).mockRejectedValueOnce(new Error("db down"));
    expect(await livePushAlertDeps().calendarDueToday()).toEqual([]);
  });
});
