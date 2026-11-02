import { describe, expect, it } from "vitest";
import { customerFromOld, receiptFromOld, watchedFromOld } from "@/lib/invoicing-migrate";

describe("old invoicing rows -> PM-Central", () => {
  it("maps a customer, keeping its id so migrated invoices still point at it", () => {
    expect(
      customerFromOld({
        id: "u-1", billing_party: "lms", name: "Smith Trust", addr: "1 Main", contact: null, attn: "Attn: J",
        service: "Squatter watch", rate: "250.00", frequency: "quarterly", start_date: "2026-03-01", is_active: false,
        rentvine_portfolio_id: "12", rentvine_contact_id: null, notes: "", created_at: "2026-03-01T10:00:00Z", updated_at: null,
      })
    ).toMatchObject({
      id: "u-1", billingParty: "lms", name: "Smith Trust", rate: 250, frequency: "quarterly",
      startDate: "2026-03-01", isActive: false, rentvinePortfolioId: "12", attn: "Attn: J",
    });
  });

  it("defaults missing party, frequency and start date", () => {
    expect(customerFromOld({ id: "u-2", name: "X", rate: null })).toMatchObject({
      billingParty: "pmi", frequency: "monthly", rate: 0, isActive: true,
    });
    expect(customerFromOld({ id: "u-2", name: "X" }).startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("maps a receipt with its items and soft-delete", () => {
    const r = receiptFromOld({
      id: "r-1", number: "R-0003", billing_party: "pmi", inspector: "Ari", paid_on: "2026-09-30", method: "Zelle",
      reference: "abc", notes: null, items: [{ property: "6 Harbor Ln", at: "2026-09-02T14:30", amount: 45 }],
      deleted_at: "2026-10-01T00:00:00Z",
    });
    expect(r).toMatchObject({ id: "r-1", number: "R-0003", inspector: "Ari", paidOn: "2026-09-30", method: "Zelle" });
    expect(r.items).toEqual([{ property: "6 Harbor Ln", at: "2026-09-02T14:30", amount: 45 }]);
    expect(r.deletedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("maps a watched property", () => {
    expect(
      watchedFromOld({ id: "w-1", address: "6 Harbor Ln", label: "Stella", source: "property", rentvine_property_id: "70", is_active: true })
    ).toMatchObject({ id: "w-1", address: "6 Harbor Ln", source: "property", rentvinePropertyId: "70", rentvinePortfolioId: null });
  });
});
