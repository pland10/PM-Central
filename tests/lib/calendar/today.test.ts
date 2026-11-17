import { describe, expect, it } from "vitest";
import { hourInET, monthsAround, todayInET } from "@/lib/calendar/today";

describe("Eastern-time helpers", () => {
  it("gives today's date and hour in New York, not UTC", () => {
    const lateEvening = new Date("2026-11-18T02:30:00Z"); // 9:30pm ET on the 17th
    expect(todayInET(lateEvening)).toBe("2026-11-17");
    expect(hourInET(lateEvening)).toBe(21);
  });

  it("lists the months around a date", () => {
    expect(monthsAround("2026-11-17", 2, 2)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  });
});
