import { describe, expect, it } from "vitest";
import { dateFor, describeRule, describeWeekdays, formatRule, formatWeekdays, occurrencesBetween, occursInMonth, parseRule, parseWeekdays, type CalendarEventRule } from "@/lib/calendar/rules";

const rule = (s: string) => {
  const r = parseRule(s);
  if (!r.ok) throw new Error(r.error);
  return r.rule;
};
const nov = (s: string, adjust: "prior" | "next" | "none" = "prior") => dateFor(rule(s), 2026, 11, adjust);

describe("parseRule", () => {
  it("accepts the supported forms, case- and space-insensitive, and normalizes them", () => {
    expect(["ME", "me-5", "ME - 5 bd", "MS+3", "ms+3bd", "D10", "bd3", "BD-1", "ME+3"].map((s) => formatRule(rule(s)))).toEqual([
      "ME", "ME-5", "ME-5BD", "MS+3", "MS+3BD", "D10", "BD3", "BD-1", "ME+3",
    ]);
  });

  it("rejects anything else with a helpful message", () => {
    for (const s of ["", "XYZ", "D0", "D32", "BD0", "BD-24", "ME-5XD", "ME-40", "MEBD"]) {
      const r = parseRule(s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/ME-5|BD3|D10/);
    }
  });
});

describe("dateFor (November 2026: ends Mon 30th; Thanksgiving Thu 26th)", () => {
  it("counts calendar days from month end", () => {
    expect(nov("ME")).toBe("2026-11-30");
    expect(nov("ME-5")).toBe("2026-11-25");
    expect(nov("ME+3")).toBe("2026-12-03");
  });

  it("counts business days, skipping weekends and holidays", () => {
    expect(nov("ME-5BD")).toBe("2026-11-20");
    expect(nov("MS+3BD")).toBe("2026-11-04");
    expect(nov("BD3")).toBe("2026-11-04");
    expect(nov("BD-1")).toBe("2026-11-30");
    expect(nov("BD-2")).toBe("2026-11-27");
  });

  it("uses a day of the month, capped at the month's length", () => {
    expect(nov("D10")).toBe("2026-11-10");
    expect(dateFor(rule("D31"), 2027, 2, "none")).toBe("2027-02-28");
  });

  it("moves a weekend / holiday date to the prior business day by default", () => {
    expect(dateFor(rule("ME"), 2026, 10, "prior")).toBe("2026-10-30"); // Oct 31 is a Saturday
    expect(dateFor(rule("D31"), 2027, 2, "prior")).toBe("2027-02-26"); // Feb 28 is a Sunday
    expect(dateFor(rule("D25"), 2026, 12, "prior")).toBe("2026-12-24"); // Christmas
  });

  it("can move to the next business day, or leave it", () => {
    expect(dateFor(rule("ME"), 2026, 10, "next")).toBe("2026-11-02");
    expect(dateFor(rule("ME"), 2026, 10, "none")).toBe("2026-10-31");
  });
});

describe("describeRule", () => {
  it("says it in words", () => {
    expect(describeRule(rule("ME-5"))).toBe("5 calendar days before month end");
    expect(describeRule(rule("ME-5BD"))).toBe("5 business days before month end");
    expect(describeRule(rule("ME"))).toBe("Last day of the month");
    expect(describeRule(rule("MS+1"))).toBe("1 calendar day after the 1st");
    expect(describeRule(rule("D10"))).toBe("10th of the month");
    expect(describeRule(rule("BD3"))).toBe("3rd business day of the month");
    expect(describeRule(rule("BD-1"))).toBe("Last business day of the month");
    expect(describeRule(rule("BD-2"))).toBe("2nd-to-last business day of the month");
  });
});

describe("frequency", () => {
  it("monthly every month; quarterly in the chosen month of each quarter; yearly in the chosen month", () => {
    expect(occursInMonth("monthly", null, 7)).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => occursInMonth("quarterly", 3, m))).toEqual([3, 6, 9, 12]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => occursInMonth("yearly", 1, m))).toEqual([1]);
  });
});

describe("occurrencesBetween", () => {
  const events: CalendarEventRule[] = [
    { id: 1, rule: "ME-5", frequency: "monthly", month: null, adjust: "prior" },
    { id: 2, rule: "D31", frequency: "yearly", month: 1, adjust: "prior" },
    { id: 3, rule: "ME+3", frequency: "monthly", month: null, adjust: "prior" },
    { id: 4, rule: "nonsense", frequency: "monthly", month: null, adjust: "prior" },
  ];

  it("lists each event's dates in the window, by date, keyed by the month they belong to", () => {
    const out = occurrencesBetween(events, "2026-12-01", "2027-02-05");
    expect(out).toEqual([
      { eventId: 3, period: "2026-11", date: "2026-12-03" }, // November's ME+3 spills into December
      { eventId: 1, period: "2026-12", date: "2026-12-24" }, // Dec 26 is a Saturday, 25th is Christmas → Thu 24th
      { eventId: 3, period: "2026-12", date: "2026-12-31" }, // Jan 3 is a Sunday, Jan 1 a holiday → Thu Dec 31
      { eventId: 1, period: "2027-01", date: "2027-01-26" },
      { eventId: 2, period: "2027-01", date: "2027-01-29" }, // Jan 31 is a Sunday → Fri 29th
      { eventId: 3, period: "2027-01", date: "2027-02-03" },
    ]); // event 4's rule doesn't parse, so it's left out
  });
});

describe("daily (every business day)", () => {
  it("lists each business day in the window, skipping weekends and holidays, keyed by the date", () => {
    const out = occurrencesBetween([{ id: 5, rule: "DAILY", frequency: "daily", month: null, adjust: "prior" }], "2026-11-23", "2026-11-29");
    expect(out).toEqual([
      { eventId: 5, period: "2026-11-23", date: "2026-11-23" },
      { eventId: 5, period: "2026-11-24", date: "2026-11-24" },
      { eventId: 5, period: "2026-11-25", date: "2026-11-25" },
      { eventId: 5, period: "2026-11-27", date: "2026-11-27" }, // 26th is Thanksgiving; 28–29 weekend
    ]);
  });

  it("occurs in every month", () => {
    expect(occursInMonth("daily", null, 2)).toBe(true);
  });
});

describe("weekly on chosen weekdays", () => {
  it("reads and writes the day list, in Mon–Fri order", () => {
    expect(parseWeekdays("WEEKLY:FR,MO,WE")).toEqual([1, 3, 5]);
    expect(parseWeekdays("weekly: tu , th")).toEqual([2, 4]);
    expect(parseWeekdays("WEEKLY:")).toBeNull();
    expect(parseWeekdays("WEEKLY:SA")).toBeNull();
    expect(parseWeekdays("ME-5")).toBeNull();
    expect(formatWeekdays([5, 1, 3, 3])).toBe("WEEKLY:MO,WE,FR");
    expect(describeWeekdays([1, 3, 5])).toBe("Mon, Wed, Fri");
  });

  it("falls on the chosen weekdays, skipping bank holidays, keyed by the date", () => {
    const out = occurrencesBetween([{ id: 6, rule: "WEEKLY:TU,TH", frequency: "weekly", month: null, adjust: "prior" }], "2026-11-23", "2026-12-04");
    expect(out.map((o) => o.date)).toEqual(["2026-11-24", "2026-12-01", "2026-12-03"]); // Thu 26th is Thanksgiving
    expect(out[0]).toEqual({ eventId: 6, period: "2026-11-24", date: "2026-11-24" });
  });
});
