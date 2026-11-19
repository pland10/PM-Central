import { describe, expect, it } from "vitest";
import { isUpcomingShowing } from "@/lib/showings-upcoming";

// 2026-11-19 10:00 ET
const NOW = new Date("2026-11-19T15:00:00Z");
const s = (over: { status?: string; startTime?: string | null; requestedTime?: string | null }) => ({
  status: "scheduled",
  startTime: null,
  requestedTime: null,
  ...over,
});

describe("isUpcomingShowing", () => {
  it("counts a showing set for today (even earlier today, Eastern) or later", () => {
    expect(isUpcomingShowing(s({ startTime: "2026-11-19T13:00:00Z" }), NOW)).toBe(true); // 8am today
    expect(isUpcomingShowing(s({ startTime: "2026-11-25T15:00:00Z" }), NOW)).toBe(true);
    expect(isUpcomingShowing(s({ startTime: "2026-11-19T03:00:00Z" }), NOW)).toBe(false); // 10pm yesterday ET
  });

  it("counts a requested showing with no time yet, or a requested time still ahead", () => {
    expect(isUpcomingShowing(s({ status: "requested" }), NOW)).toBe(true);
    expect(isUpcomingShowing(s({ status: "requested", requestedTime: "2026-11-21T15:00:00Z" }), NOW)).toBe(true);
    expect(isUpcomingShowing(s({ status: "requested", requestedTime: "2026-11-10T15:00:00Z" }), NOW)).toBe(false);
  });

  it("never counts cancelled, no-show or completed ones", () => {
    for (const status of ["cancelled", "no-show", "completed"]) {
      expect(isUpcomingShowing(s({ status, startTime: "2026-11-25T15:00:00Z" }), NOW)).toBe(false);
      expect(isUpcomingShowing(s({ status }), NOW)).toBe(false);
    }
  });
});
