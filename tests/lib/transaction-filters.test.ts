import { describe, expect, it } from "vitest";
import { normalizeHidePattern, patternToLike } from "@/lib/transaction-filters";

describe("patternToLike", () => {
  it("turns * into a SQL wildcard", () => {
    expect(patternToLike("*CSG FORTE*")).toBe("%CSG FORTE%");
    expect(patternToLike("AMAZON*")).toBe("AMAZON%");
  });

  it("matches anywhere when there's no *", () => {
    expect(patternToLike("CSG FORTE")).toBe("%CSG FORTE%");
  });

  it("escapes characters that are wildcards in SQL but literal to the user", () => {
    expect(patternToLike("*50% OFF_SALE*")).toBe("%50\\% OFF\\_SALE%");
    expect(patternToLike("A\\B")).toBe("%A\\\\B%");
  });
});

describe("normalizeHidePattern", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeHidePattern("  *CSG   FORTE*  ")).toBe("*CSG FORTE*");
  });

  it("rejects empty input and patterns that would hide everything", () => {
    expect(normalizeHidePattern("")).toBeNull();
    expect(normalizeHidePattern("   ")).toBeNull();
    expect(normalizeHidePattern("*")).toBeNull();
    expect(normalizeHidePattern("** *")).toBeNull();
    expect(normalizeHidePattern(42)).toBeNull();
  });

  it("caps the length", () => {
    expect(normalizeHidePattern("A".repeat(500))?.length).toBe(200);
  });
});

import { normalizeComment } from "@/lib/transaction-filters";

describe("normalizeComment", () => {
  it("trims, requires text and caps the length", () => {
    expect(normalizeComment("  Rentvine ACH fees ")).toBe("Rentvine ACH fees");
    expect(normalizeComment("   ")).toBeNull();
    expect(normalizeComment(undefined)).toBeNull();
    expect(normalizeComment("x".repeat(3000))?.length).toBe(1000);
  });
});
