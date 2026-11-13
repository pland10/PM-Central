import { describe, expect, it } from "vitest";
import type { WorkOrderRow } from "@/lib/work-orders";
import {
  archivedByWeek,
  backlogByStage,
  medianDaysToClose,
  openedClosedByWeek,
  preventiveSplit,
  recentWeekStarts,
  weekStart,
  workOrderHeadline,
} from "@/lib/management-kpis";

// 2026-11-09 is a Monday; 2026-11-13 is that Friday.
const NOW = new Date("2026-11-13T12:00:00Z");

function wo(over: Partial<WorkOrderRow>): WorkOrderRow {
  return {
    id: "x",
    number: "100",
    issue: "Job",
    stage: "New WO",
    terminal: false,
    property: "",
    vendor: "",
    assignee: "",
    link: "",
    priority: "",
    propertyId: null,
    lastUpdate: "",
    lastUpdateAt: null,
    createdAt: null,
    updatedAt: null,
    closedAt: null,
    dueAt: null,
    rvStatus: "",
    preventive: false,
    ...over,
  };
}

describe("weekStart / recentWeekStarts", () => {
  it("snaps any day to that week's Monday (UTC)", () => {
    expect(weekStart(new Date("2026-11-13T12:00:00Z"))).toBe("2026-11-09"); // Friday → Monday
    expect(weekStart(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09"); // Monday → itself
    expect(weekStart(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-02"); // Sunday → previous Monday
  });

  it("lists the recent Mondays oldest-first, ending at now's week", () => {
    expect(recentWeekStarts(NOW, 3)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });
});

describe("openedClosedByWeek", () => {
  it("buckets opens by createdAt and closes by closedAt, 0-filling empty weeks", () => {
    const wos = [
      wo({ createdAt: "2026-11-10T09:00:00Z" }), // opened this week
      wo({ createdAt: "2026-11-03T09:00:00Z" }), // opened last week
      wo({ terminal: true, createdAt: "2026-10-01T00:00:00Z", closedAt: "2026-11-11T09:00:00Z" }), // closed this week
      wo({ createdAt: "2026-01-01T00:00:00Z" }), // older than the 3-week window → dropped
    ];
    const series = openedClosedByWeek(wos, 3, NOW);
    expect(series.map((p) => p.week)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(series.find((p) => p.week === "2026-11-09")).toMatchObject({ opened: 1, closed: 1 });
    expect(series.find((p) => p.week === "2026-11-02")).toMatchObject({ opened: 1, closed: 0 });
    expect(series.find((p) => p.week === "2026-10-26")).toMatchObject({ opened: 0, closed: 0 });
    expect(series[0].label).toMatch(/Oct 26/);
  });
});

describe("backlogByStage", () => {
  it("counts only open work orders, grouped by stage, largest first", () => {
    const wos = [
      wo({ stage: "New WO" }),
      wo({ stage: "New WO" }),
      wo({ stage: "Scheduling in Progress" }),
      wo({ stage: "Completed", terminal: true }), // closed → excluded
    ];
    expect(backlogByStage(wos)).toEqual([
      { stage: "New WO", count: 2 },
      { stage: "Scheduling in Progress", count: 1 },
    ]);
  });
});

describe("preventiveSplit", () => {
  it("splits open work orders into preventive vs reactive", () => {
    const wos = [
      wo({ preventive: true }),
      wo({ preventive: false }),
      wo({ preventive: false }),
      wo({ preventive: true, terminal: true }), // closed → excluded
    ];
    expect(preventiveSplit(wos)).toEqual({ preventive: 1, reactive: 2 });
  });
});

describe("medianDaysToClose", () => {
  it("is the median open→close span over recently closed work orders", () => {
    const wos = [
      wo({ terminal: true, createdAt: "2026-11-01T00:00:00Z", closedAt: "2026-11-03T00:00:00Z" }), // 2 days
      wo({ terminal: true, createdAt: "2026-11-01T00:00:00Z", closedAt: "2026-11-06T00:00:00Z" }), // 5 days
      wo({ terminal: true, createdAt: "2026-11-01T00:00:00Z", closedAt: "2026-11-11T00:00:00Z" }), // 10 days
    ];
    expect(medianDaysToClose(wos, 90, NOW)).toBe(5);
  });

  it("averages the two middle spans for an even count", () => {
    const wos = [
      wo({ terminal: true, createdAt: "2026-11-01T00:00:00Z", closedAt: "2026-11-03T00:00:00Z" }), // 2
      wo({ terminal: true, createdAt: "2026-11-01T00:00:00Z", closedAt: "2026-11-05T00:00:00Z" }), // 4
    ];
    expect(medianDaysToClose(wos, 90, NOW)).toBe(3);
  });

  it("ignores work orders closed before the window and returns null when none qualify", () => {
    const old = wo({ terminal: true, createdAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-05T00:00:00Z" });
    expect(medianDaysToClose([old], 90, NOW)).toBeNull();
  });
});

describe("workOrderHeadline", () => {
  it("summarizes open count, this-week flow, and preventive share", () => {
    const wos = [
      wo({ createdAt: "2026-11-10T00:00:00Z", preventive: true }), // open, opened this week, preventive
      wo({ createdAt: "2026-11-02T00:00:00Z" }), // open, opened last week
      wo({ terminal: true, createdAt: "2026-10-01T00:00:00Z", closedAt: "2026-11-11T00:00:00Z" }), // closed this week
    ];
    expect(workOrderHeadline(wos, NOW)).toMatchObject({
      open: 2,
      openedThisWeek: 1,
      closedThisWeek: 1,
      preventiveShare: 50, // 1 of 2 open
    });
  });
});

describe("archivedByWeek", () => {
  it("buckets archive timestamps into the recent weeks, 0-filling", () => {
    const series = archivedByWeek(["2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z", "2026-11-03T00:00:00Z", null], 3, NOW);
    expect(series.find((p) => p.week === "2026-11-09")?.count).toBe(2);
    expect(series.find((p) => p.week === "2026-11-02")?.count).toBe(1);
    expect(series.find((p) => p.week === "2026-10-26")?.count).toBe(0);
  });
});
