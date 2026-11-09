import { describe, expect, it } from "vitest";
import { isPreventiveTitle } from "@/lib/preventive";

describe("isPreventiveTitle", () => {
  it.each(["HVAC Tuneup", "HVAC tune up", "HVAC tune-up", "Annual HVAC Tune Ups", "Sprinkler winterization", "Winterize sprinklers", "sprinkler system winterizing"])(
    "treats %s as preventive",
    (t) => expect(isPreventiveTitle(t)).toBe(true)
  );

  it.each(["Boiler not turning on", "HVAC not cooling", "Sprinkler head broken", "Fix the oven", ""])("treats %s as reactive", (t) =>
    expect(isPreventiveTitle(t)).toBe(false)
  );
});
