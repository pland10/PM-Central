import { describe, expect, it } from "vitest";
import {
  attentionQueue,
  attentionReason,
  lastActivityAt,
  maintenanceKpis,
  recentActivity,
  rowStatus,
} from "@/lib/maintenance";
import type { WorkOrderRow } from "@/lib/work-orders";

const NOW = new Date("2026-10-27T15:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function wo(over: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    id: "ls-1",
    number: "100",
    issue: "Leaking sink",
    stage: "Troubleshooting",
    terminal: false,
    property: "1 Main St",
    vendor: "",
    assignee: "",
    link: "",
    priority: "",
    propertyId: null,
    lastUpdate: "",
    lastUpdateAt: null,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    closedAt: null,
    dueAt: null,
    ...over,
  };
}

describe("lastActivityAt", () => {
  it("takes the later of the LeadSimple update and the latest Rentvine update", () => {
    expect(lastActivityAt(wo({ updatedAt: daysAgo(5), lastUpdateAt: daysAgo(2) }))).toBe(daysAgo(2));
    expect(lastActivityAt(wo({ updatedAt: daysAgo(1), lastUpdateAt: daysAgo(4) }))).toBe(daysAgo(1));
    expect(lastActivityAt(wo({ updatedAt: null, lastUpdateAt: null }))).toBeNull();
  });
});

describe("attentionReason", () => {
  it("flags an open work order past its due date as Overdue", () => {
    expect(attentionReason(wo({ dueAt: daysAgo(1) }), NOW)).toEqual({ kind: "overdue", label: "Overdue" });
  });

  it("flags High priority (from Rentvine) next", () => {
    expect(attentionReason(wo({ priority: "High" }), NOW)?.kind).toBe("high");
  });

  it("flags a New WO that has waited more than a day", () => {
    expect(attentionReason(wo({ stage: "New WO", createdAt: daysAgo(2) }), NOW)?.label).toBe("New WO needs action");
    expect(attentionReason(wo({ stage: "New WO", createdAt: daysAgo(0.5) }), NOW)).toBeNull();
  });

  it("flags no activity for more than 3 days as stalled, with the day count", () => {
    expect(attentionReason(wo({ updatedAt: daysAgo(5) }), NOW)).toEqual({ kind: "stalled", label: "Stalled 5 days" });
    expect(attentionReason(wo({ updatedAt: daysAgo(3) }), NOW)).toBeNull(); // exactly 3 — not yet
  });

  it("does not call it stalled when Rentvine shows recent activity", () => {
    expect(attentionReason(wo({ updatedAt: daysAgo(8), lastUpdateAt: daysAgo(1) }), NOW)).toBeNull();
  });

  it("never flags a closed work order", () => {
    expect(attentionReason(wo({ terminal: true, dueAt: daysAgo(3), priority: "High" }), NOW)).toBeNull();
  });

  it("uses the most urgent reason when several apply", () => {
    expect(attentionReason(wo({ dueAt: daysAgo(1), priority: "High", updatedAt: daysAgo(9) }), NOW)?.kind).toBe("overdue");
  });
});

describe("rowStatus", () => {
  it("distinguishes completed, cancelled, needs-attention and open", () => {
    expect(rowStatus(wo({ terminal: true, stage: "Completed" }), NOW)).toBe("completed");
    expect(rowStatus(wo({ terminal: true, stage: "Cancelled" }), NOW)).toBe("cancelled");
    expect(rowStatus(wo({ updatedAt: daysAgo(6) }), NOW)).toBe("attention");
    expect(rowStatus(wo(), NOW)).toBe("open");
  });
});

describe("maintenanceKpis", () => {
  it("counts open, stalled, overdue, waiting new WOs and completions in the last 7 days", () => {
    const rows = [
      wo({ id: "a" }), // open
      wo({ id: "b", updatedAt: daysAgo(6) }), // open + stalled
      wo({ id: "c", dueAt: daysAgo(1), updatedAt: daysAgo(6) }), // open + overdue + stalled
      wo({ id: "d", stage: "New WO", createdAt: daysAgo(2) }), // open + new waiting
      wo({ id: "e", terminal: true, stage: "Completed", closedAt: daysAgo(2) }), // completed this week
      wo({ id: "f", terminal: true, stage: "Completed", closedAt: daysAgo(9) }), // too old
      wo({ id: "g", terminal: true, stage: "Cancelled", closedAt: daysAgo(1) }), // cancelled — not a completion
    ];

    expect(maintenanceKpis(rows, NOW)).toEqual({
      open: 4,
      stalled: 2,
      overdue: 1,
      newWaiting: 1,
      completedThisWeek: 1,
      hasDueDates: true,
    });
  });

  it("says when no work order has a due date, so the tile can show — instead of 0", () => {
    expect(maintenanceKpis([wo()], NOW).hasDueDates).toBe(false);
  });
});

describe("attentionQueue", () => {
  it("orders overdue, then High, then new, then stalled (longest stalled first), and caps the list", () => {
    const rows = [
      wo({ id: "stalled4", updatedAt: daysAgo(4) }),
      wo({ id: "stalled9", updatedAt: daysAgo(9) }),
      wo({ id: "new", stage: "New WO", createdAt: daysAgo(2) }),
      wo({ id: "high", priority: "High" }),
      wo({ id: "overdue", dueAt: daysAgo(1) }),
      wo({ id: "fine" }),
      wo({ id: "closed", terminal: true, stage: "Completed", dueAt: daysAgo(1) }),
    ];

    expect(attentionQueue(rows, NOW).map((q) => q.row.id)).toEqual(["overdue", "high", "new", "stalled9", "stalled4"]);
    expect(attentionQueue(rows, NOW, 2)).toHaveLength(2);
  });
});

describe("recentActivity", () => {
  it("lists the most recently active work orders with what happened", () => {
    const rows = [
      wo({ id: "old", updatedAt: daysAgo(5) }),
      wo({ id: "done", terminal: true, stage: "Completed", updatedAt: daysAgo(0.1), closedAt: daysAgo(0.1) }),
      wo({ id: "rv", updatedAt: daysAgo(3), lastUpdateAt: daysAgo(0.2), lastUpdate: "Vendor scheduled for Tue" }),
      wo({ id: "none", updatedAt: null, lastUpdateAt: null }),
    ];

    const items = recentActivity(rows, 3);
    expect(items.map((i) => [i.row.id, i.event])).toEqual([
      ["done", "completed"],
      ["rv", "updated"],
      ["old", "updated"],
    ]);
    expect(items[1].detail).toBe("Vendor scheduled for Tue");
  });
});
