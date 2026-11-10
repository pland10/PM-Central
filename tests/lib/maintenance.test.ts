import { describe, expect, it } from "vitest";
import {
  attentionQueue,
  attentionReason,
  lastActivityAt,
  maintenanceKpis,
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
    rvStatus: "",
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

  it("flags a New WO as soon as it appears — no waiting period", () => {
    expect(attentionReason(wo({ stage: "New WO", createdAt: daysAgo(2) }), NOW)?.label).toBe("New WO needs action");
    // Brand-new (created minutes ago) still flags immediately.
    expect(attentionReason(wo({ stage: "New WO", createdAt: daysAgo(0.01) }), NOW)?.kind).toBe("new");
  });

  it("flags no activity for more than 3 days as stalled, with the day count", () => {
    expect(attentionReason(wo({ updatedAt: daysAgo(5) }), NOW)).toEqual({ kind: "stalled", label: "Stalled 5 days" });
    expect(attentionReason(wo({ updatedAt: daysAgo(3) }), NOW)).toBeNull(); // exactly 3 — not yet
  });

  it("does not call it stalled when Rentvine shows recent activity", () => {
    expect(attentionReason(wo({ updatedAt: daysAgo(8), lastUpdateAt: daysAgo(1) }), NOW)).toBeNull();
  });

  it("flags a work order Rentvine already completed or cancelled, ahead of everything else", () => {
    expect(attentionReason(wo({ rvStatus: "Completed", dueAt: daysAgo(40) }), NOW)).toEqual({
      kind: "rvClosed",
      label: "Completed in Rentvine · open in LeadSimple",
    });
    expect(attentionReason(wo({ rvStatus: "Cancelled" }), NOW)?.label).toBe("Cancelled in Rentvine · open in LeadSimple");
  });

  it("flags a work order On Hold in Rentvine but active in LeadSimple, instead of Overdue", () => {
    // WO 100206: On Hold in Rentvine, still "Work Scheduled" in LeadSimple
    // (should be Deferred there), and past its due date.
    expect(attentionReason(wo({ rvStatus: "On Hold", dueAt: daysAgo(40) }), NOW)).toEqual({
      kind: "rvOnHold",
      label: "On Hold in Rentvine · open in LeadSimple",
    });
  });

  it("does not flag a Rentvine On Hold work order that's already Deferred in LeadSimple", () => {
    expect(attentionReason(wo({ rvStatus: "On Hold", stage: "Deferred", terminal: true }), NOW)).toBeNull();
  });

  it("keeps preventive work (tune-ups, winterization) off the attention list unless it's overdue", () => {
    // New, quiet for weeks — would be flagged if it were a repair
    const tuneUp = wo({ issue: "HVAC Tuneup", preventive: true, stage: "New WO", createdAt: daysAgo(20), updatedAt: daysAgo(20) });
    expect(attentionReason(tuneUp, NOW)).toBeNull();
    expect(attentionReason({ ...tuneUp, dueAt: daysAgo(2) }, NOW)).toEqual({ kind: "overdue", label: "Overdue" });
    // A Rentvine mismatch is a data problem — still flagged
    expect(attentionReason({ ...tuneUp, rvStatus: "Completed" }, NOW)?.kind).toBe("rvClosed");
  });

  it("does not treat Rentvine Open or Pending Closure as closed", () => {
    expect(attentionReason(wo({ rvStatus: "Open" }), NOW)).toBeNull();
    expect(attentionReason(wo({ rvStatus: "Pending Closure" }), NOW)).toBeNull();
  });

  it("flags a WO sitting in an estimate stage with no activity for over 3 days", () => {
    expect(attentionReason(wo({ stage: "Estimate Requested", updatedAt: daysAgo(5) }), NOW)).toEqual({
      kind: "estimates",
      label: "Waiting on estimates 5 days",
    });
    expect(attentionReason(wo({ stage: "Multiple Estimates", updatedAt: daysAgo(4) }), NOW)?.kind).toBe("estimates");
    // recent activity — not waiting yet
    expect(attentionReason(wo({ stage: "Estimate Requested", updatedAt: daysAgo(2) }), NOW)).toBeNull();
  });

  it("ranks waiting-on-estimates above the automatic Overdue date", () => {
    expect(attentionReason(wo({ stage: "Estimate Requested", updatedAt: daysAgo(6), dueAt: daysAgo(1) }), NOW)?.kind).toBe(
      "estimates"
    );
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
      openReactive: 4,
      openPreventive: 0,
      stalled: 2,
      overdue: 1,
      newWaiting: 1,
      completedThisWeek: 1,
      hasDueDates: true,
    });
  });

  it("leaves preventive work out of Stalled and New WOs waiting (still Open, still Overdue)", () => {
    const tuneUp = { preventive: true, stage: "New WO", createdAt: daysAgo(20), updatedAt: daysAgo(20), dueAt: daysAgo(1) };
    expect(maintenanceKpis([wo({ id: "p", ...tuneUp })], NOW)).toMatchObject({ open: 1, stalled: 0, newWaiting: 0, overdue: 1 });
  });

  it("splits open work orders into reactive and preventive (closed ones don't count)", () => {
    const rows = [
      wo({ id: "r1" }),
      wo({ id: "r2" }),
      wo({ id: "p1", preventive: true }),
      wo({ id: "p2", preventive: true, terminal: true, stage: "Completed", closedAt: daysAgo(1) }),
    ];
    expect(maintenanceKpis(rows, NOW)).toMatchObject({ open: 3, openReactive: 2, openPreventive: 1 });
  });

  it("says when no work order has a due date, so the tile can show — instead of 0", () => {
    expect(maintenanceKpis([wo()], NOW).hasDueDates).toBe(false);
  });
});

describe("attentionQueue", () => {
  it("orders closed-in-Rentvine, overdue, then High, then new, then stalled (longest stalled first), and caps the list", () => {
    const rows = [
      wo({ id: "stalled4", updatedAt: daysAgo(4) }),
      wo({ id: "stalled9", updatedAt: daysAgo(9) }),
      wo({ id: "new", stage: "New WO", createdAt: daysAgo(2) }),
      wo({ id: "high", priority: "High" }),
      wo({ id: "overdue", dueAt: daysAgo(1) }),
      wo({ id: "fine" }),
      wo({ id: "closed", terminal: true, stage: "Completed", dueAt: daysAgo(1) }),
      wo({ id: "rvdone", rvStatus: "Completed" }),
    ];

    expect(attentionQueue(rows, NOW).map((q) => q.row.id)).toEqual(["rvdone", "overdue", "high", "new", "stalled9", "stalled4"]);
    expect(attentionQueue(rows, NOW, 2)).toHaveLength(2);
  });
});
