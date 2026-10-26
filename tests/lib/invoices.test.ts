import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, invoiceTotals, lineAmount } from "@/lib/invoices";

describe("lineAmount", () => {
  it("multiplies qty by rate", () => {
    expect(lineAmount({ qty: 3, rate: 25 })).toBe(75);
  });

  it("accepts numeric strings (the standalone app stores strings)", () => {
    expect(lineAmount({ qty: "2", rate: "12.50" })).toBe(25);
  });

  it("treats missing or non-numeric parts as zero", () => {
    expect(lineAmount({ qty: 2 })).toBe(0);
    expect(lineAmount({ qty: "abc", rate: 10 })).toBe(0);
    expect(lineAmount({})).toBe(0);
  });
});

describe("invoiceTotals", () => {
  it("sums lines and applies tax as a percentage", () => {
    const totals = invoiceTotals(
      [
        { qty: 1, rate: 100 },
        { qty: 2, rate: 50 },
      ],
      "8.875"
    );
    expect(totals.subtotal).toBe(200);
    expect(totals.tax).toBeCloseTo(17.75, 10);
    expect(totals.total).toBeCloseTo(217.75, 10);
  });

  it("handles no items and no tax rate", () => {
    expect(invoiceTotals(null, null)).toEqual({ subtotal: 0, tax: 0, total: 0 });
    expect(invoiceTotals([{ qty: 1, rate: 40 }], undefined)).toEqual({ subtotal: 40, tax: 0, total: 40 });
  });
});

describe("formatMoney", () => {
  it("keeps cents", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });
});

describe("formatDate", () => {
  it("formats a plain YYYY-MM-DD as that calendar day (no timezone slip)", () => {
    expect(formatDate("2027-03-31")).toBe("Mar 31, 2027");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("renders a dash for empty or invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});
