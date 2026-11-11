import { describe, expect, it } from "vitest";
import { buildBillIndex, candidatesFor, classifyBilling, type RvBillLine } from "@/lib/rv-bill-match";

const line = (over: Partial<RvBillLine> = {}): RvBillLine => ({
  transactionId: "t1",
  billId: "2985",
  propertyRvId: "36",
  amount: 472.19,
  date: "2026-11-10",
  description: "Village Permit for HVAC",
  payee: "PMI Lighthouse Reimbursable",
  reference: "",
  ...over,
});

const prop = (id: string) => `pmilighthouse:property:${id}`;

describe("candidatesFor", () => {
  it("finds a bill line with the same amount posted around the charge date", () => {
    const idx = buildBillIndex([line()]);
    const c = candidatesFor({ amount: 472.19, postedDate: "2026-11-07" }, idx);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "line", billId: "2985", properties: ["36"], amount: 472.19, date: "2026-11-10" });
  });

  it("ignores lines a cent off, or billed far outside the window", () => {
    const idx = buildBillIndex([
      line({ transactionId: "a", amount: 472.18 }),
      line({ transactionId: "b", date: "2026-03-01" }), // months before the charge
      line({ transactionId: "c", date: "2027-06-01" }), // long after
    ]);
    expect(candidatesFor({ amount: 472.19, postedDate: "2026-11-07" }, idx)).toEqual([]);
  });

  it("matches one card charge against a whole bill split across properties", () => {
    const idx = buildBillIndex([
      line({ transactionId: "x1", billId: "2977", propertyRvId: "19", amount: 100, date: "2026-11-09" }),
      line({ transactionId: "x2", billId: "2977", propertyRvId: "50", amount: 100, date: "2026-11-09" }),
      line({ transactionId: "x3", billId: "2977", propertyRvId: "27", amount: 50.25, date: "2026-11-09" }),
    ]);
    const c = candidatesFor({ amount: 250.25, postedDate: "2026-11-05" }, idx);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "bill", billId: "2977", amount: 250.25 });
    expect(c[0].properties.sort()).toEqual(["19", "27", "50"]);
  });

  it("has nothing for credits or a charge with no date", () => {
    const idx = buildBillIndex([line()]);
    expect(candidatesFor({ amount: -472.19, postedDate: "2026-11-07" }, idx)).toEqual([]);
    expect(candidatesFor({ amount: 472.19, postedDate: null }, idx)).toEqual([]);
  });
});

describe("classifyBilling (by property)", () => {
  const idx = buildBillIndex([line(), line({ transactionId: "t2", billId: "3001", propertyRvId: "99" })]);
  const cands = candidatesFor({ amount: 472.19, postedDate: "2026-11-07" }, idx);

  it("is billed when a candidate is on the transaction's property", () => {
    const s = classifyBilling({ amount: 472.19, propertyId: prop("36"), candidates: cands });
    expect(s).toMatchObject({ status: "billed", match: { billId: "2985" } });
  });

  it("is only a possible match when the amount was billed on other properties", () => {
    expect(classifyBilling({ amount: 472.19, propertyId: prop("12"), candidates: cands })?.status).toBe("possible");
  });

  it("is a possible match when no property is tagged yet", () => {
    expect(classifyBilling({ amount: 472.19, propertyId: null, candidates: cands })?.status).toBe("possible");
  });

  it("is not found when nothing was billed for that amount", () => {
    expect(classifyBilling({ amount: 10, propertyId: prop("36"), candidates: [] })?.status).toBe("not_found");
  });

  it("re-checks against whatever property is tagged now", () => {
    expect(classifyBilling({ amount: 472.19, propertyId: prop("99"), candidates: cands })).toMatchObject({
      status: "billed",
      match: { billId: "3001" },
    });
  });

  it("has no status for credits or before the bill sync has run", () => {
    expect(classifyBilling({ amount: -5, propertyId: null, candidates: [] })).toBeNull();
    expect(classifyBilling({ amount: 5, propertyId: null, candidates: undefined })).toBeNull();
  });
});
