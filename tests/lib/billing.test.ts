import { describe, expect, it } from "vitest";
import {
  billingRun,
  currentPeriodKey,
  dueInPeriod,
  invoiceDraftForCustomer,
  periodLabel,
  type BillingCustomer,
} from "@/lib/billing";

const cust = (over: Partial<BillingCustomer> = {}): BillingCustomer => ({
  id: "c1",
  billingParty: "pmi",
  name: "Smith Family Trust",
  addr: "10 Main St\nAnytown, NY 11000",
  contact: "555-0100",
  attn: "Attn: J. Smith",
  service: "Squatter watch — weekly inspection",
  rate: 250,
  frequency: "monthly",
  startDate: "2026-03-15",
  isActive: true,
  ...over,
});

describe("periods", () => {
  it("labels a period key as month and year", () => {
    expect(periodLabel("2026-11")).toBe("November 2026");
  });

  it("takes the current period in New York time, not UTC", () => {
    // 02:00 UTC on Nov 1 is still Oct 31 in New York.
    expect(currentPeriodKey(Date.parse("2026-11-01T02:00:00Z"))).toBe("2026-10");
    expect(currentPeriodKey(Date.parse("2026-11-01T12:00:00Z"))).toBe("2026-11");
  });
});

describe("dueInPeriod", () => {
  it("bills monthly customers every month from their start month", () => {
    expect(dueInPeriod(cust(), "2026-02")).toBe(false); // before the agreement
    expect(dueInPeriod(cust(), "2026-03")).toBe(true);
    expect(dueInPeriod(cust(), "2026-11")).toBe(true);
  });

  it("bills quarterly every third month and annual every twelfth, from the start", () => {
    const q = cust({ frequency: "quarterly" });
    expect(["2026-03", "2026-04", "2026-05", "2026-06"].map((k) => dueInPeriod(q, k))).toEqual([true, false, false, true]);
    const a = cust({ frequency: "annual" });
    expect(dueInPeriod(a, "2027-03")).toBe(true);
    expect(dueInPeriod(a, "2027-04")).toBe(false);
  });

  it("never bills inactive or one-off customers", () => {
    expect(dueInPeriod(cust({ isActive: false }), "2026-11")).toBe(false);
    expect(dueInPeriod(cust({ frequency: "none" }), "2026-11")).toBe(false);
  });
});

describe("billingRun", () => {
  it("lists everyone due with their invoice for the period, or a gap", () => {
    const customers = [cust({ id: "a", rate: 200 }), cust({ id: "b", rate: 300 }), cust({ id: "c", isActive: false })];
    const invoices = [
      { id: "i1", number: "PMI-0101", status: "sent", customerId: "a", periodKey: "2026-11" },
      { id: "i0", number: "PMI-0090", status: "paid", customerId: "b", periodKey: "2026-10" }, // last month
    ];
    const run = billingRun(customers, invoices, "2026-11");

    expect(run.rows.map((r) => [r.customer.id, r.invoice?.number ?? null])).toEqual([
      ["a", "PMI-0101"],
      ["b", null],
    ]);
    expect(run.missing.map((c) => c.id)).toEqual(["b"]);
    expect(run.expected).toBe(500);
  });
});

describe("invoiceDraftForCustomer", () => {
  it("prices the invoice from the customer record for the period", () => {
    const d = invoiceDraftForCustomer(cust(), "2026-11", { terms: "Net 15", taxRate: 0 }, "2026-11-02");
    expect(d).toMatchObject({
      billingParty: "pmi",
      customerId: "c1",
      periodKey: "2026-11",
      invoiceDate: "2026-11-02",
      dueDate: "2026-11-17",
      period: "Squatter watch — weekly inspection — November 2026",
      terms: "Net 15",
      status: "draft",
      billTo: { name: "Smith Family Trust", addr: "10 Main St\nAnytown, NY 11000", contact: "555-0100", extra: "Attn: J. Smith" },
      items: [{ desc: "Squatter watch — weekly inspection", qty: 1, rate: 250 }],
    });
  });

  it("falls back to 'Services' and Net 30", () => {
    const d = invoiceDraftForCustomer(cust({ service: "" }), "2026-11", {}, "2026-11-02");
    expect(d.items).toEqual([{ desc: "Services", qty: 1, rate: 250 }]);
    expect(d.dueDate).toBe("2026-12-02");
  });
});
