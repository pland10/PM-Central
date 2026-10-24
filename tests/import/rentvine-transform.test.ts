import { describe, expect, it } from "vitest";
import { rentvineToCanonical } from "@/import/sources/rentvine/transform";
import type { RentvineExport, RvLease, RvProperty } from "@/import/sources/rentvine/raw";

const property = (over: Partial<RvProperty> = {}): RvProperty => ({
  id: 12,
  street: "66 Francis Court",
  city: "Elmont",
  state: "NY",
  zip: "11003",
  type: "Single Family Home",
  ...over,
});

const lease = (over: Partial<RvLease> = {}): RvLease => ({
  prop: 12,
  leaseId: 27,
  tenant: "Pamela Roberts",
  start: "2026-04-01",
  end: "2027-03-31",
  rent: 2500,
  ...over,
});

const exportOf = (over: Partial<RentvineExport> = {}): RentvineExport => ({
  account: "pmilighthouse",
  properties: [property()],
  activeLeases: [],
  workOrders: [],
  ...over,
});

describe("rentvineToCanonical", () => {
  it("tags the dataset with its source and account", () => {
    const ds = rentvineToCanonical(exportOf());
    expect(ds.source).toBe("rentvine");
    expect(ds.account).toBe("pmilighthouse");
  });

  it("gives a property with no active lease one vacant unit", () => {
    const [p] = rentvineToCanonical(exportOf()).properties;
    expect(p.units).toEqual([{ externalId: "12-1", unitNumber: "1", status: "vacant", lease: null }]);
  });

  it("maps each active lease to an occupied unit with its lease and tenant", () => {
    const [p] = rentvineToCanonical(
      exportOf({ activeLeases: [lease({ email: "p@example.com", phone: "+15550001", depositBalance: 2500 })] })
    ).properties;

    expect(p.units).toHaveLength(1);
    expect(p.units[0]).toMatchObject({ externalId: "12-1", status: "occupied" });
    expect(p.units[0].lease).toMatchObject({
      externalId: "27",
      status: "active",
      rent: 2500,
      balanceDue: 0,
      depositBalance: 2500,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    expect(p.units[0].lease!.tenants[0]).toMatchObject({
      firstName: "Pamela",
      lastName: "Roberts",
      email: "p@example.com",
      phone: "+15550001",
    });
  });

  it("creates one unit per lease on a multi-lease property", () => {
    const [p] = rentvineToCanonical(
      exportOf({ activeLeases: [lease({ leaseId: 1 }), lease({ leaseId: 2, tenant: "Second Person" })] })
    ).properties;
    expect(p.units.map((u) => u.externalId)).toEqual(["12-1", "12-2"]);
  });

  it("falls back to a synthetic lease id when Rentvine has none", () => {
    const [p] = rentvineToCanonical(exportOf({ activeLeases: [lease({ leaseId: undefined })] })).properties;
    expect(p.units[0].lease!.externalId).toBe("12-1");
  });

  it("treats company-like tenant names as companies", () => {
    const [p] = rentvineToCanonical(exportOf({ activeLeases: [lease({ tenant: "Acme Services LLC" })] })).properties;
    expect(p.units[0].lease!.tenants[0]).toMatchObject({ companyName: "Acme Services LLC" });
    expect(p.units[0].lease!.tenants[0]).not.toHaveProperty("firstName");
  });

  it("handles single-word tenant names", () => {
    const [p] = rentvineToCanonical(exportOf({ activeLeases: [lease({ tenant: "Cher" })] })).properties;
    expect(p.units[0].lease!.tenants[0]).toMatchObject({ firstName: "Cher", lastName: null });
  });

  it("maps known property types to slugs and passes unknown ones through", () => {
    const ds = rentvineToCanonical(
      exportOf({ properties: [property({ id: 1, type: "Condo" }), property({ id: 2, type: "7" })] })
    );
    expect(ds.properties.map((p) => p.propertyType)).toEqual(["condo", "7"]);
  });

  it("slugifies property groups into tags (Squatter Watch)", () => {
    const [p] = rentvineToCanonical(exportOf({ properties: [property({ groups: ["Squatter Watch"] })] })).properties;
    expect(p.tags).toEqual(["squatterwatch"]);
  });

  it("sets the owner only when there is a portfolio id", () => {
    const ds = rentvineToCanonical(
      exportOf({
        properties: [
          property({ id: 1, owner: "Owner LLC", portfolioId: 3 }),
          property({ id: 2, owner: "No Portfolio" }),
        ],
      })
    );
    expect(ds.properties[0].owner).toEqual({ externalId: "3", name: "Owner LLC" });
    expect(ds.properties[1].owner).toBeNull();
  });

  it("defaults property status to active and keeps inactive", () => {
    const ds = rentvineToCanonical(
      exportOf({ properties: [property({ id: 1 }), property({ id: 2, status: "inactive" })] })
    );
    expect(ds.properties.map((p) => p.status)).toEqual(["active", "inactive"]);
  });

  it("truncates long work-order titles and defaults status to open", () => {
    const desc = "A".repeat(80);
    const [wo] = rentvineToCanonical(
      exportOf({ workOrders: [{ id: 5, prop: 12, desc, priority: "high" }] })
    ).workOrders;

    expect(wo.title).toBe("A".repeat(57) + "…");
    expect(wo.description).toBe(desc);
    expect(wo).toMatchObject({ externalId: "5", propertyExternalId: "12", status: "open", priority: "high" });
  });
});
