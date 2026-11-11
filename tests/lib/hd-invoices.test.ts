import { describe, expect, it } from "vitest";
import { hdTransactionId, parseHdInvoicesCsv } from "@/lib/hd-invoices";

// The two real exports (Home Depot Pro → Invoices by Statement Date).
const NOV = `Invoices by Statement Date
Invoice Date,Invoice Number,Purchase Order,Amount Due
Nov 07 2026,5533628,,$20.62
Nov 07 2026,5134066,NA,$-6.51
Nov 05 2026,7510217,,$231.65
Nov 04 2026,8513573,FHOUSE,$27.06
Nov 03 2026,9521199,,$10.73
Nov 03 2026,9550526,,$90.04
`;
const OCT = `Invoices by Statement Date
Invoice Date,Invoice Number,Purchase Order,Amount Due
Oct 07 2026,6514734,MOHAMHUNTINGTON,$54.85
Sep 30 2026,3905077,VISHNU,$166.22
Sep 28 2026,5900156,PATRICIA-HALF;HAS,$410.05
`;

describe("parseHdInvoicesCsv", () => {
  it("reads every invoice: date, number, PO job name, amount", () => {
    const { rows, errors } = parseHdInvoicesCsv(NOV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ invoiceNumber: "5533628", date: "2026-11-07", po: "", amount: 20.62 });
    expect(rows[3]).toEqual({ invoiceNumber: "8513573", date: "2026-11-04", po: "FHOUSE", amount: 27.06 });
  });

  it("keeps returns negative (a credit) and treats NA as no PO", () => {
    const r = parseHdInvoicesCsv(NOV).rows[1];
    expect(r).toMatchObject({ invoiceNumber: "5134066", po: "", amount: -6.51 });
  });

  it("reads the October export too, including a PO with punctuation", () => {
    const { rows } = parseHdInvoicesCsv(OCT);
    expect(rows.map((r) => [r.date, r.po])).toEqual([
      ["2026-10-07", "MOHAMHUNTINGTON"],
      ["2026-09-30", "VISHNU"],
      ["2026-09-28", "PATRICIA-HALF;HAS"],
    ]);
  });

  it("copes with quoted fields, thousands separators and Windows line endings", () => {
    const csv = 'Invoice Date,Invoice Number,Purchase Order,Amount Due\r\n"Nov 01 2026","1234567","JOB, A","$1,234.50"\r\n';
    expect(parseHdInvoicesCsv(csv).rows).toEqual([
      { invoiceNumber: "1234567", date: "2026-11-01", po: "JOB, A", amount: 1234.5 },
    ]);
  });

  it("reports bad lines instead of guessing", () => {
    const csv = "Invoice Date,Invoice Number,Purchase Order,Amount Due\nsometime,123,,$5.00\nNov 02 2026,,,$5.00\n";
    const { rows, errors } = parseHdInvoicesCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it("rejects a file that isn't the Home Depot invoice export", () => {
    expect(() => parseHdInvoicesCsv("Date,Description,Amount\n2026-11-01,Coffee,4.00\n")).toThrow(/home depot/i);
  });
});

describe("hdTransactionId", () => {
  it("is stable per invoice, so re-importing never duplicates", () => {
    expect(hdTransactionId("5533628")).toBe("hd:5533628");
  });
});
