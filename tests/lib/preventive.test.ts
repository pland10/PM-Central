import { describe, expect, it } from "vitest";
import { isPreventiveTitle, matchesPreventive, normalizePreventivePattern } from "@/lib/preventive";

describe("isPreventiveTitle", () => {
  it.each(["HVAC Tuneup", "HVAC tune up", "HVAC tune-up", "Annual HVAC Tune Ups", "Sprinkler winterization", "Winterize sprinklers", "sprinkler system winterizing"])(
    "treats %s as preventive",
    (t) => expect(isPreventiveTitle(t)).toBe(true)
  );

  it.each(["Boiler not turning on", "HVAC not cooling", "Sprinkler head broken", "Fix the oven", ""])("treats %s as reactive", (t) =>
    expect(isPreventiveTitle(t)).toBe(false)
  );
});

describe("matchesPreventive (built-ins + admin keywords)", () => {
  it("stays preventive for built-in rules regardless of keywords", () => {
    expect(matchesPreventive("HVAC Tuneup", [])).toBe(true);
  });

  it("matches an admin keyword anywhere in the title, case-insensitively", () => {
    expect(matchesPreventive("Quarterly Gutter Cleaning", ["gutter cleaning"])).toBe(true);
    expect(matchesPreventive("GUTTER cleaning - front", ["Gutter Cleaning"])).toBe(true);
    expect(matchesPreventive("Clean the gutters", ["gutter cleaning"])).toBe(false); // not a substring
  });

  it("is reactive when nothing matches, and ignores blank keywords", () => {
    expect(matchesPreventive("Boiler not turning on", ["gutter cleaning"])).toBe(false);
    expect(matchesPreventive("Boiler not turning on", ["", "   "])).toBe(false);
  });
});

describe("normalizePreventivePattern", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePreventivePattern("  gutter   cleaning ")).toBe("gutter cleaning");
  });
  it("returns null for empty or non-strings", () => {
    expect(normalizePreventivePattern("   ")).toBeNull();
    expect(normalizePreventivePattern(null)).toBeNull();
    expect(normalizePreventivePattern(42)).toBeNull();
  });
});
