import { describe, expect, it } from "vitest";
import { expandSplitRows, parseRowId, rowIdOf, sanitizeSplitLines, type SplitLine } from "@/lib/transaction-splits";
import type { TxnRow } from "@/lib/plaid-db";

const base: TxnRow = {
  transactionId: "t1",
  postedDate: "2026-11-04",
  accountName: "Amex",
  merchantName: "The Home Depot",
  name: "HOMEDEPOT",
  amount: 200,
  category: "",
  pending: false,
  reimbursable: null,
  categoryOverride: "",
  recordedQuickbooks: false,
  recordedRentvine: false,
  notes: "",
  propertyId: null,
  unitId: null,
  archived: false,
};

const line = (amount: number, extra: Partial<SplitLine> = {}): Record<string, unknown> => ({ amount, ...extra });

describe("sanitizeSplitLines", () => {
  it("accepts lines that add up to the charge, keeping each line's own fields", () => {
    const r = sanitizeSplitLines(
      [
        line(120, { propertyId: "rentvine:12", reimbursable: "yes", categoryOverride: " Repairs " }),
        line(80, { reimbursable: "no", recordedQuickbooks: true }),
      ],
      200
    );
    expect("lines" in r && r.lines).toEqual([
      { amount: 120, reimbursable: "yes", categoryOverride: "Repairs", recordedQuickbooks: false, recordedRentvine: false, propertyId: "rentvine:12", unitId: null },
      { amount: 80, reimbursable: "no", categoryOverride: "", recordedQuickbooks: true, recordedRentvine: false, propertyId: null, unitId: null },
    ]);
  });

  it("compares to the cent (no floating-point surprises)", () => {
    expect("lines" in sanitizeSplitLines([line(0.1), line(0.2)], 0.3)).toBe(true);
    expect("lines" in sanitizeSplitLines([line(33.33), line(33.33), line(33.34)], 100)).toBe(true);
  });

  it("refuses lines that don't add up, and says by how much", () => {
    const r = sanitizeSplitLines([line(120), line(70)], 200);
    expect(r).toEqual({ error: "The lines add up to $190.00 — $10.00 short of the $200.00 charge." });
    const over = sanitizeSplitLines([line(150), line(70)], 200);
    expect(over).toEqual({ error: "The lines add up to $220.00 — $20.00 over the $200.00 charge." });
  });

  it("needs at least two lines, each with an amount", () => {
    expect(sanitizeSplitLines([line(200)], 200)).toEqual({ error: "A split needs at least two lines." });
    expect(sanitizeSplitLines([line(200), line(0)], 200)).toEqual({ error: "Every line needs an amount." });
    expect(sanitizeSplitLines([line(200), { amount: "x" }], 200)).toEqual({ error: "Every line needs an amount." });
    expect(sanitizeSplitLines("nope", 200)).toEqual({ error: "A split needs at least two lines." });
  });

  it("caps the number of lines", () => {
    const many = Array.from({ length: 26 }, () => line(1));
    expect(sanitizeSplitLines(many, 26)).toEqual({ error: "A split can have at most 25 lines." });
  });

  it("keeps a unit only together with its property", () => {
    const r = sanitizeSplitLines([line(100, { unitId: "u1" }), line(100, { propertyId: "rentvine:1", unitId: "u2" })], 200);
    expect("lines" in r && r.lines.map((l) => [l.propertyId, l.unitId])).toEqual([
      [null, null],
      ["rentvine:1", "u2"],
    ]);
  });
});

describe("expandSplitRows", () => {
  it("leaves unsplit charges as they are", () => {
    expect(expandSplitRows([base], {})).toEqual([base]);
  });

  it("turns a split charge into one row per line, each with its own amount and fields", () => {
    const rows = expandSplitRows([base], {
      t1: [
        { id: 7, amount: 120, reimbursable: "yes", categoryOverride: "Repairs", recordedQuickbooks: true, recordedRentvine: false, propertyId: "rentvine:12", unitId: null },
        { id: 8, amount: 80, reimbursable: "no", categoryOverride: "Office", recordedQuickbooks: false, recordedRentvine: false, propertyId: null, unitId: null },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionId: "t1",
      rowId: "t1#7",
      amount: 120,
      reimbursable: "yes",
      propertyId: "rentvine:12",
      recordedQuickbooks: true,
      merchantName: "The Home Depot",
      split: { lineId: 7, lineNo: 1, count: 2, total: 200, balanced: true },
    });
    expect(rows[1]).toMatchObject({ rowId: "t1#8", amount: 80, split: { lineNo: 2, count: 2 } });
  });

  it("flags lines that no longer add up (e.g. the posted amount changed)", () => {
    const rows = expandSplitRows([{ ...base, amount: 210 }], {
      t1: [
        { id: 1, amount: 120, reimbursable: null, categoryOverride: "", recordedQuickbooks: false, recordedRentvine: false, propertyId: null, unitId: null },
        { id: 2, amount: 80, reimbursable: null, categoryOverride: "", recordedQuickbooks: false, recordedRentvine: false, propertyId: null, unitId: null },
      ],
    });
    expect(rows.every((r) => r.split?.balanced === false)).toBe(true);
  });
});

describe("row ids", () => {
  it("uses the line's id for a split line, the transaction id otherwise", () => {
    expect(rowIdOf(base)).toBe("t1");
    expect(rowIdOf({ ...base, rowId: "t1#7" })).toBe("t1#7");
  });

  it("parses a line id back into the charge and the line", () => {
    expect(parseRowId("t1#7")).toEqual({ transactionId: "t1", lineId: 7 });
    expect(parseRowId("hd:5533628")).toEqual({ transactionId: "hd:5533628", lineId: null });
    expect(parseRowId("t1#x")).toEqual({ transactionId: "t1#x", lineId: null });
  });
});
