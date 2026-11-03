import { describe, expect, it } from "vitest";
import { nextReceiptNumber, parseReceiptInput, receiptTotal } from "@/lib/receipts";

describe("receipts", () => {
  it("totals the visit amounts, ignoring blanks", () => {
    expect(receiptTotal([{ property: "a", at: "", amount: 45 }, { property: "b", at: "", amount: "30.5" }, { property: "", at: "", amount: "" }])).toBe(75.5);
  });

  it("numbers the next receipt per prefix", () => {
    expect(nextReceiptNumber("PMI-R-", ["PMI-R-0007", "PMI-R-0012", "LMS-R-0040", "PMI-R-x"])).toBe("PMI-R-0013");
    expect(nextReceiptNumber("LMS-R-", [])).toBe("LMS-R-0001");
  });

  it("validates and cleans an edit", () => {
    const ok = parseReceiptInput({
      inspector: " Ari ",
      paidOn: "2026-11-03",
      method: "Zelle",
      reference: "",
      notes: "",
      items: [
        { property: "6 Harbor Ln", at: "2026-11-01", amount: "45" },
        { property: "", at: "", amount: "" }, // empty line dropped
      ],
    });
    expect(ok).toEqual({
      ok: true,
      data: {
        inspector: "Ari",
        paidOn: "2026-11-03",
        method: "Zelle",
        reference: null,
        notes: null,
        items: [{ property: "6 Harbor Ln", at: "2026-11-01", amount: 45 }],
      },
    });
  });

  it("rejects a bad paid date or amount", () => {
    expect(parseReceiptInput({ paidOn: "11/3/2026", items: [] }).ok).toBe(false);
    expect(parseReceiptInput({ paidOn: "2026-11-03", items: [{ property: "x", at: "", amount: "abc" }] }).ok).toBe(false);
  });
});
