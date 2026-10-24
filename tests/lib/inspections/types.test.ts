import { describe, expect, it } from "vitest";
import {
  formatInspectionDate,
  isNotApplicable,
  needsAttention,
  parseSpecialInstructions,
  statusTone,
} from "@/lib/inspections/types";

describe("statusTone / needsAttention (the form's status options)", () => {
  it.each([
    ["Satisfactory", "good", false],
    ["Needs attention", "warn", true],
    ["Issues found", "bad", true],
    ["", "neutral", false],
    [null, "neutral", false],
  ])("%s → %s", (status, tone, attention) => {
    expect(statusTone(status)).toBe(tone);
    expect(needsAttention(status)).toBe(attention);
  });
});

describe("isNotApplicable", () => {
  it.each(["N/A", "n/a", " N/A "])("recognizes %j", (s) => expect(isNotApplicable(s)).toBe(true));
  it.each(["OK", "", null, "NA"])("rejects %j", (s) => expect(isNotApplicable(s)).toBe(false));
});

describe("parseSpecialInstructions", () => {
  it("parses the checklist JSON form", () => {
    expect(
      parseSpecialInstructions('[{"id":2,"name":"Check mail","checked":true},{"id":"3","name":"Run taps"},{"id":4}]')
    ).toEqual({
      states: [
        { id: 2, name: "Check mail", checked: true },
        { id: 3, name: "Run taps", checked: false },
      ],
      text: "",
    });
  });

  it("treats anything else as free text", () => {
    expect(parseSpecialInstructions("Leave key under mat")).toEqual({ states: [], text: "Leave key under mat" });
    expect(parseSpecialInstructions("[not json")).toEqual({ states: [], text: "[not json" });
  });

  it("handles empty input", () => {
    expect(parseSpecialInstructions(null)).toEqual({ states: [], text: "" });
  });
});

describe("formatInspectionDate", () => {
  it("formats a calendar date without timezone slip", () => {
    expect(formatInspectionDate("2026-10-20")).toBe("Oct 20, 2026");
  });

  it("renders a dash for missing or invalid dates", () => {
    expect(formatInspectionDate(null)).toBe("—");
    expect(formatInspectionDate("garbage")).toBe("—");
  });
});
