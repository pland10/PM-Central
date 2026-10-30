import { describe, expect, it } from "vitest";
import {
  categoryKey,
  decideCategory,
  duplicateGroups,
  normalizeCategoryName,
} from "@/lib/transaction-categories";

describe("normalizeCategoryName", () => {
  it("trims and collapses spaces, and rejects empty input", () => {
    expect(normalizeCategoryName("  Pay   roll ")).toBe("Pay roll");
    expect(normalizeCategoryName("  ")).toBeNull();
    expect(normalizeCategoryName(7)).toBeNull();
    expect(normalizeCategoryName("x".repeat(300))?.length).toBe(120);
  });
});

describe("categoryKey", () => {
  it("ignores case, spaces and punctuation so look-alikes compare equal", () => {
    expect(categoryKey("Payroll")).toBe(categoryKey("pay roll"));
    expect(categoryKey("Pay-Roll")).toBe(categoryKey("PAYROLL "));
    expect(categoryKey("Repairs")).not.toBe(categoryKey("Repair"));
  });
});

describe("decideCategory", () => {
  const existing = ["Payroll", "Supplies"];

  it("uses the existing spelling when the typed value is a look-alike", () => {
    expect(decideCategory("pay roll", existing, { open: false, isAdmin: false })).toEqual({ name: "Payroll", isNew: false });
  });

  it("adds a brand-new category while the list is open", () => {
    expect(decideCategory("Utilities", existing, { open: true, isAdmin: false })).toEqual({ name: "Utilities", isNew: true });
  });

  it("refuses a new category once the list is locked, except for admins", () => {
    expect(decideCategory("Utilities", existing, { open: false, isAdmin: false })).toHaveProperty("error");
    expect(decideCategory("Utilities", existing, { open: false, isAdmin: true })).toEqual({ name: "Utilities", isNew: true });
  });

  it("allows clearing the category", () => {
    expect(decideCategory("  ", existing, { open: false, isAdmin: false })).toEqual({ name: "", isNew: false });
  });
});

describe("duplicateGroups", () => {
  it("groups look-alike categories, most-used first, and skips singletons", () => {
    const groups = duplicateGroups([
      { name: "Payroll", count: 10 },
      { name: "pay roll", count: 2 },
      { name: "Supplies", count: 4 },
      { name: "PAYROLL!", count: 12 },
    ]);
    expect(groups).toEqual([["PAYROLL!", "Payroll", "pay roll"]]);
  });
});
