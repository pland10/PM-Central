import { describe, expect, it } from "vitest";
import { addBusinessDays, bankHolidays, isBusinessDay, nextBusinessDay, priorBusinessDay } from "@/lib/calendar/business-days";

describe("bankHolidays (Federal Reserve)", () => {
  it("has the 2026 holidays, with July 4 (a Saturday) not moved", () => {
    const h = bankHolidays(2026);
    for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]) {
      expect(h.has(d), d).toBe(true);
    }
    expect(h.has("2026-07-03")).toBe(false);
    expect(h.size).toBe(10);
  });

  it("moves a Sunday holiday to Monday; leaves a Saturday one alone (2027)", () => {
    const h = bankHolidays(2027);
    expect(h.has("2027-07-05")).toBe(true); // July 4 is a Sunday
    expect(h.has("2027-06-18")).toBe(false); // Juneteenth is a Saturday
    expect(h.has("2027-12-24")).toBe(false); // Christmas is a Saturday
  });
});

describe("business days", () => {
  it("skips weekends and bank holidays", () => {
    expect(isBusinessDay("2026-11-25")).toBe(true); // Wed
    expect(isBusinessDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(isBusinessDay("2026-10-31")).toBe(false); // Saturday
  });

  it("finds the prior / next business day (or the day itself)", () => {
    expect(priorBusinessDay("2026-10-31")).toBe("2026-10-30");
    expect(nextBusinessDay("2026-10-31")).toBe("2026-11-02");
    expect(priorBusinessDay("2026-12-25")).toBe("2026-12-24");
    expect(priorBusinessDay("2026-11-25")).toBe("2026-11-25");
  });

  it("counts business days forward and back, not counting the start", () => {
    expect(addBusinessDays("2026-11-30", -5)).toBe("2026-11-20"); // skips Thanksgiving + weekend
    expect(addBusinessDays("2026-11-01", 3)).toBe("2026-11-04");
    expect(addBusinessDays("2026-11-25", 0)).toBe("2026-11-25");
  });
});
