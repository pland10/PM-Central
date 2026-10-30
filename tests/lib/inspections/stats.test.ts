import { describe, expect, it } from "vitest";
import { summarizeInspections } from "@/lib/inspections/stats";
import type { InspectionRow } from "@/lib/inspections/types";

// Wednesday 2026-10-28 (UTC). Week = Sun 2026-10-25 .. Sat 2026-10-31; month = 2026-10.
const NOW = new Date("2026-10-28T12:00:00Z");

const row = (over: Partial<InspectionRow>): InspectionRow =>
  ({
    id: 1,
    property_id: null,
    inspection_reason: null,
    inspector_name: null,
    inspection_date: null,
    inspection_time: null,
    notes: null,
    overall_status: null,
    special_instructions: null,
    created_by_user_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    summary_sent_at: null,
    ...over,
  }) as InspectionRow;

describe("summarizeInspections", () => {
  it("counts this week, this month, needs-attention and total", () => {
    const rows = [
      row({ id: 1, inspection_date: "2026-10-26", overall_status: "Passed" }), // week + month
      row({ id: 2, inspection_date: "2026-10-20", overall_status: "Failed" }), // month, attention
      row({ id: 3, inspection_date: "2026-09-30", overall_status: "Needs attention", resolution_status: "resolved" }), // handled, other month
      row({ id: 4, inspection_date: null, overall_status: "Failed" }), // attention, no date
      row({ id: 5, inspection_date: "2026-10-31", overall_status: "Passed" }), // Saturday edge: week + month
    ];

    expect(summarizeInspections(rows, NOW)).toEqual({
      total: 5,
      thisWeek: 2, // #1, #5
      thisMonth: 3, // #1, #2, #5
      upcoming: 1, // #5 is dated 10-31 (future)
      overdue: 0, // past-dated rows are all done/handled
      needsAttention: 2, // #2, #4 (#3 is resolved)
    });
  });

  it("counts upcoming (future) and overdue (past, not done) inspections", () => {
    const rows = [
      row({ id: 1, inspection_date: "2026-11-05", overall_status: "" }), // future → upcoming
      row({ id: 2, inspection_date: "2026-11-02", overall_status: "Scheduled" }), // future → upcoming
      row({ id: 3, inspection_date: "2026-10-10", overall_status: "" }), // past, blank → overdue
      row({ id: 4, inspection_date: "2026-10-12", overall_status: "Scheduled" }), // past, still scheduled → overdue
      row({ id: 5, inspection_date: "2026-10-12", overall_status: "Passed" }), // past, done → not overdue
      row({ id: 6, inspection_date: "2026-10-09", overall_status: "Scheduled", resolution_status: "work_order" }), // handled → not overdue
      row({ id: 7, inspection_date: "2026-10-28", overall_status: "" }), // today → neither
      row({ id: 8, inspection_date: null, overall_status: "" }), // no date → neither
    ];

    const s = summarizeInspections(rows, NOW);
    expect(s.upcoming).toBe(2); // #1, #2
    expect(s.overdue).toBe(2); // #3, #4
  });

  it("handles a datetime value, not just a bare date", () => {
    const rows = [row({ id: 1, inspection_date: "2026-10-27T09:30:00Z", overall_status: "Passed" })];
    expect(summarizeInspections(rows, NOW).thisWeek).toBe(1);
  });

  it("is all zeros for no inspections", () => {
    expect(summarizeInspections([], NOW)).toEqual({
      total: 0,
      thisWeek: 0,
      thisMonth: 0,
      upcoming: 0,
      overdue: 0,
      needsAttention: 0,
    });
  });
});
