import { describe, expect, it } from "vitest";
import {
  isMeetingDate,
  isoDate,
  mondayOf,
  nestTopics,
  recentMeetingMondays,
  recentMeetingTuesdays,
  splitMeetingGroups,
  tuesdayOf,
} from "@/lib/meetings";

describe("meeting dates", () => {
  it("mondayOf returns the Monday on or before the date", () => {
    expect(mondayOf(new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-16"); // Wed → that Mon
    expect(mondayOf(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16"); // Mon → itself
    expect(mondayOf(new Date("2026-11-22T23:00:00Z"))).toBe("2026-11-16"); // Sun → prior Mon
  });

  it("recentMeetingMondays lists Mondays newest-first, 7 days apart", () => {
    const mondays = recentMeetingMondays(new Date("2026-11-18T12:00:00Z"), 3);
    expect(mondays).toEqual(["2026-11-16", "2026-11-09", "2026-11-02"]);
  });

  it("tuesdayOf returns the Tuesday on or before the date; picker lists them", () => {
    expect(tuesdayOf(new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-17"); // Wed → that Tue
    expect(tuesdayOf(new Date("2026-11-17T00:00:00Z"))).toBe("2026-11-17"); // Tue → itself
    expect(tuesdayOf(new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-10"); // Mon → prior Tue
    expect(recentMeetingTuesdays(new Date("2026-11-18T12:00:00Z"), 2)).toEqual(["2026-11-17", "2026-11-10"]);
  });

  it("validates YYYY-MM-DD meeting dates", () => {
    expect(isMeetingDate("2026-11-16")).toBe(true);
    expect(isMeetingDate("2026-13-99")).toBe(false);
    expect(isMeetingDate("11/16/2026")).toBe(false);
    expect(isMeetingDate(20261116)).toBe(false);
    expect(isoDate(new Date("2026-11-16T09:00:00Z"))).toBe("2026-11-16");
  });
});

describe("splitMeetingGroups", () => {
  const items = [
    { id: "a", tags: "", sortKey: "9 Oak Ave" },
    { id: "b", tags: "squatterwatch", sortKey: "5 Pine St" },
    { id: "c", tags: "section8", sortKey: "1 Main St" },
    { id: "d", tags: "squatterwatch,foo", sortKey: "2 Elm Rd" },
  ];

  it("puts squatter-watch houses in their own group, each sorted by label", () => {
    const { rentals, squatterWatch } = splitMeetingGroups(items);
    expect(rentals.map((r) => r.id)).toEqual(["c", "a"]); // 1 Main, 9 Oak
    expect(squatterWatch.map((r) => r.id)).toEqual(["d", "b"]); // 2 Elm, 5 Pine
  });

  it("follows a custom order within each group; unordered houses fall to the end alphabetically", () => {
    const more = [...items, { id: "e", tags: "", sortKey: "3 Birch Ln" }];
    const { rentals, squatterWatch } = splitMeetingGroups(more, { a: 0, c: 1, b: 0 });
    // a (order 0) then c (order 1), then e (no order → end, by label)
    expect(rentals.map((r) => r.id)).toEqual(["a", "c", "e"]);
    // b ordered first; d unordered → after b
    expect(squatterWatch.map((r) => r.id)).toEqual(["b", "d"]);
  });
});

describe("nestTopics", () => {
  it("nests topics under their section, keeping order", () => {
    const sections = [{ id: 1, title: "Growth" }, { id: 2, title: "Ops" }];
    const topics = [
      { id: 10, sectionId: 1, title: "Hiring" },
      { id: 11, sectionId: 2, title: "Software" },
      { id: 12, sectionId: 1, title: "Marketing" },
    ];
    const nested = nestTopics(sections, topics);
    expect(nested[0].topics.map((t) => t.id)).toEqual([10, 12]);
    expect(nested[1].topics.map((t) => t.id)).toEqual([11]);
  });
});
