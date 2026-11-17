import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/calendar/db", () => ({ listCalendarEvents: vi.fn(), listTaskStatuses: vi.fn() }));
const deps = {
  attentionWorkOrders: vi.fn(),
  returnedPayments: vi.fn(),
  readyDraws: vi.fn(),
  staleSyncs: vi.fn(),
};
vi.mock("@/lib/push-alerts-live", () => ({ livePushAlertDeps: () => deps }));

import { listCalendarEvents, listTaskStatuses } from "@/lib/calendar/db";
import { gatherDailySummary } from "@/lib/calendar/daily-summary-live";

const ev = (over: Record<string, unknown>) => ({
  id: 1, title: "T", description: "", rule: "ME-5", frequency: "monthly", month: null, adjust: "prior",
  ownerEmail: null, ownerName: null, active: true, ...over,
});

beforeEach(() => {
  deps.attentionWorkOrders.mockResolvedValue([{ number: "4567", issue: "Roof leak", property: "1 Main", priority: "High", link: "", isNew: true, isHigh: true }]);
  deps.returnedPayments.mockResolvedValue([]);
  deps.readyDraws.mockResolvedValue([{ id: "a", amount: 100 }, { id: "b", amount: 50.25 }]);
  deps.staleSyncs.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("gatherDailySummary (Wed Nov 25 2026, 6am ET)", () => {
  const NOW = new Date("2026-11-25T11:00:00Z");

  it("collects today's tasks (with done), overdue open ones, and the alerts", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue([
      ev({ id: 1, title: "Reimbursables review", rule: "WEEKLY:MO,WE,FR", frequency: "weekly", ownerName: "Jasper" }),
      ev({ id: 2, title: "Month-end bills", rule: "ME-5", ownerName: "Ari" }), // Nov 25 → today
      ev({ id: 3, title: "Late fees", rule: "D6" }), // Nov 6 → overdue unless done
      ev({ id: 4, title: "Owner statements", rule: "BD7" }), // Nov 10 → done
      ev({ id: 5, title: "Old daily", rule: "DAILY", frequency: "daily", active: false }), // inactive
    ] as never);
    vi.mocked(listTaskStatuses).mockResolvedValue({
      "2:2026-10": { doneBy: "a", doneByName: "Ari", doneAt: "x" }, // October's (Oct 26) done too
      "2:2026-11": { doneBy: "a", doneByName: "Ari", doneAt: "x" },
      "4:2026-11": { doneBy: "a", doneByName: "Ari", doneAt: "x" },
      "1:2026-11-23": { doneBy: "j", doneByName: "Jasper", doneAt: "x" }, // Monday done
    });

    const d = await gatherDailySummary(NOW);
    expect(d.date).toBe("2026-11-25");
    expect(d.dueToday).toEqual([
      { title: "Reimbursables review", rule: "Mon, Wed, Fri", owner: "Jasper", done: false },
      { title: "Month-end bills", rule: "ME-5", owner: "Ari", done: true },
    ]);
    expect(d.overdue).toEqual([{ title: "Late fees", rule: "D6", owner: null, date: "2026-11-06" }]);
    expect(d.workOrders.map((w) => w.number)).toEqual(["4567"]);
    expect(d.draws).toEqual({ count: 2, total: 150.25 });
    expect(listTaskStatuses).toHaveBeenCalledWith({}, ["2026-10", "2026-11"]);
  });

  it("counts a per-day task as overdue only for the previous business day", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue([ev({ id: 7, title: "Bank feed", rule: "DAILY", frequency: "daily" })] as never);
    vi.mocked(listTaskStatuses).mockResolvedValue({});
    const d = await gatherDailySummary(NOW);
    expect(d.overdue).toEqual([{ title: "Bank feed", rule: "Daily", owner: null, date: "2026-11-24" }]);
  });

  it("still sends what it can when a source fails", async () => {
    vi.mocked(listCalendarEvents).mockRejectedValue(new Error("db down"));
    deps.readyDraws.mockResolvedValue(null);
    deps.returnedPayments.mockRejectedValue(new Error("nope"));
    const d = await gatherDailySummary(NOW);
    expect(d.dueToday).toEqual([]);
    expect(d.draws).toBeNull();
    expect(d.returnedPayments).toEqual([]);
    expect(d.workOrders).toHaveLength(1);
  });
});
