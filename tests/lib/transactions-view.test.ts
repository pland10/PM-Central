import { describe, expect, it } from "vitest";
import { summarizeTransactions, sanitizeAnnotationPatch } from "@/lib/transactions-view";

describe("summarizeTransactions", () => {
  const rows = [
    { amount: 100, reimbursable: "yes" as const, recordedQuickbooks: true, recordedRentvine: false },
    { amount: 50, reimbursable: "no" as const, recordedQuickbooks: false, recordedRentvine: false },
    { amount: 200, reimbursable: "yes" as const, recordedQuickbooks: false, recordedRentvine: true },
    { amount: -30, reimbursable: null, recordedQuickbooks: true, recordedRentvine: true },
  ];

  it("totals spend, credits, reimbursables and the open-work counts", () => {
    expect(summarizeTransactions(rows)).toEqual({
      count: 4,
      totalSpend: 350, // positive amounts (charges)
      totalCredits: 30, // negative amounts, as a positive number
      net: 320,
      reimbursableTotal: 300, // amount where reimbursable === "yes"
      reimbursableCount: 2,
      unreviewedCount: 1, // reimbursable not set yet
      pendingQuickbooks: 2, // not yet recorded in QuickBooks
      pendingRentvine: 2, // not yet recorded in Rentvine
    });
  });

  it("is all-zeros for an empty list", () => {
    expect(summarizeTransactions([])).toEqual({
      count: 0,
      totalSpend: 0,
      totalCredits: 0,
      net: 0,
      reimbursableTotal: 0,
      reimbursableCount: 0,
      unreviewedCount: 0,
      pendingQuickbooks: 0,
      pendingRentvine: 0,
    });
  });
});

describe("sanitizeAnnotationPatch", () => {
  it("passes through only the keys present, normalized", () => {
    expect(sanitizeAnnotationPatch({ reimbursable: "yes" })).toEqual({ reimbursable: "yes" });
    expect(sanitizeAnnotationPatch({ reimbursable: "no" })).toEqual({ reimbursable: "no" });
    expect(sanitizeAnnotationPatch({ recordedRentvine: false })).toEqual({ recordedRentvine: false });
    expect(sanitizeAnnotationPatch({ recordedQuickbooks: true })).toEqual({ recordedQuickbooks: true });
  });

  it("coerces an invalid reimbursable value to null (unreviewed)", () => {
    expect(sanitizeAnnotationPatch({ reimbursable: "maybe" })).toEqual({ reimbursable: null });
    expect(sanitizeAnnotationPatch({ reimbursable: null })).toEqual({ reimbursable: null });
  });

  it("trims a category override and caps notes length", () => {
    expect(sanitizeAnnotationPatch({ categoryOverride: "  Supplies  " })).toEqual({ categoryOverride: "Supplies" });
    const long = "x".repeat(5000);
    expect(sanitizeAnnotationPatch({ notes: long }).notes).toHaveLength(2000);
  });

  it("ignores unknown keys and non-object bodies", () => {
    expect(sanitizeAnnotationPatch({ foo: 1, reimbursable: "yes" })).toEqual({ reimbursable: "yes" });
    expect(sanitizeAnnotationPatch(null)).toEqual({});
    expect(sanitizeAnnotationPatch("nope")).toEqual({});
    expect(sanitizeAnnotationPatch({})).toEqual({});
  });
});
