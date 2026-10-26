import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalDataset, CanonicalProperty } from "@/import/canonical";
import { loadCanonical } from "@/import/load";

type Fields = Record<string, unknown>;
type UpsertArgs = { where: { source_externalId: { source: string; externalId: string } }; create: Fields; update: Fields };

// A recording stand-in for the Prisma models loadCanonical touches. upsert
// returns a row with a predictable id; link tables report "not linked yet".
function fakePrisma() {
  const model = (name: string) => ({
    upsert: vi.fn(async (args: UpsertArgs) => ({ id: `${name}:${args.where.source_externalId.externalId}` })),
    deleteMany: vi.fn(async (_args: { where: Fields }) => ({ count: 0 })),
    findUnique: vi.fn(async (_args: { where: Fields }): Promise<{ id: string } | null> => null),
    create: vi.fn(async (_args: { data: Fields }) => ({})),
  });
  return {
    portfolio: model("portfolio"),
    contact: model("contact"),
    ownerLink: model("ownerLink"),
    property: model("property"),
    unit: model("unit"),
    lease: model("lease"),
    leaseTenant: model("leaseTenant"),
    workOrder: model("workOrder"),
  };
}

type Fake = ReturnType<typeof fakePrisma>;
let db: Fake;
const load = (ds: CanonicalDataset, opts?: Parameters<typeof loadCanonical>[2]) =>
  loadCanonical(db as unknown as PrismaClient, ds, opts);

const prop = (over: Partial<CanonicalProperty> = {}): CanonicalProperty => ({
  externalId: "12",
  street1: "66 Francis Court",
  city: "Elmont",
  state: "NY",
  zip: "11003",
  propertyType: "single-family",
  status: "active",
  tags: [],
  owner: { externalId: "3", name: "Owner Holdings LLC" },
  units: [
    {
      externalId: "12-1",
      unitNumber: "1",
      status: "occupied",
      lease: {
        externalId: "27",
        status: "active",
        rent: 2500,
        balanceDue: 0,
        depositBalance: 2500,
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        tenants: [
          { externalId: "12-1-t", firstName: "Pamela", lastName: "Roberts" },
          { externalId: "12-1-t2", firstName: "Co", lastName: "Tenant" },
        ],
      },
    },
  ],
  ...over,
});

const dataset = (over: Partial<CanonicalDataset> = {}): CanonicalDataset => ({
  source: "rentvine",
  account: "pmilighthouse",
  properties: [prop()],
  workOrders: [],
  ...over,
});

const upsertArgs = (m: Fake["property"], i = 0) => m.upsert.mock.calls[i][0];

beforeEach(() => {
  db = fakePrisma();
});

describe("loadCanonical", () => {
  it("upserts every record on (source, account-namespaced externalId)", async () => {
    const counts = await load(dataset());

    expect(counts).toEqual({ properties: 1, units: 1, leases: 1, tenants: 2, workOrders: 0 });
    expect(upsertArgs(db.property).where).toEqual({
      source_externalId: { source: "rentvine", externalId: "pmilighthouse:property:12" },
    });
    expect(upsertArgs(db.unit).where.source_externalId.externalId).toBe("pmilighthouse:unit:12-1");
    expect(upsertArgs(db.lease).where.source_externalId.externalId).toBe("pmilighthouse:lease:27");
    expect(upsertArgs(db.portfolio).where.source_externalId.externalId).toBe("pmilighthouse:portfolio:3");
  });

  it("stores lease dates as Dates and links the property to its portfolio", async () => {
    await load(dataset());

    expect(upsertArgs(db.lease).create.endDate).toEqual(new Date("2027-03-31"));
    expect(upsertArgs(db.property).create.portfolioId).toBe("portfolio:pmilighthouse:portfolio:3");
  });

  it("creates the owner as a company or a person by name", async () => {
    await load(
      dataset({
        properties: [
          prop({ externalId: "1", owner: { externalId: "3", name: "Owner Holdings LLC" } }),
          prop({ externalId: "2", owner: { externalId: "4", name: "Jane Q Owner" }, units: [] }),
        ],
      })
    );

    const owners = db.contact.upsert.mock.calls.map(([a]) => a).filter((a) => a.create.roles === "owner");
    expect(owners[0].create).toMatchObject({ companyName: "Owner Holdings LLC", firstName: null });
    expect(owners[1].create).toMatchObject({ companyName: null, firstName: "Jane", lastName: "Q Owner" });
  });

  it("links tenants once, with the first one primary", async () => {
    await load(dataset());

    expect(db.leaseTenant.create.mock.calls.map(([a]) => a.data.isPrimary)).toEqual([true, false]);

    db.leaseTenant.create.mockClear();
    db.leaseTenant.findUnique.mockResolvedValue({ id: "existing" });
    await load(dataset());
    expect(db.leaseTenant.create).not.toHaveBeenCalled();
  });

  it("loads work orders for known properties and skips orphans", async () => {
    const counts = await load(
      dataset({
        workOrders: [
          { externalId: "5", propertyExternalId: "12", title: "Leak", status: "open", priority: "high" },
          { externalId: "6", propertyExternalId: "999", title: "Elsewhere", status: "open", priority: "low" },
        ],
      })
    );

    expect(counts.workOrders).toBe(1);
    expect(upsertArgs(db.workOrder).create).toMatchObject({
      externalId: "pmilighthouse:wo:5",
      propertyId: "property:pmilighthouse:property:12",
    });
  });

  describe("replace mode (default)", () => {
    it("overwrites tags and balances and never sweeps", async () => {
      await load(dataset({ properties: [prop({ tags: [] })] }));

      expect(upsertArgs(db.property).update).toHaveProperty("tags", "");
      expect(upsertArgs(db.lease).update).toMatchObject({ balanceDue: 0, depositBalance: 2500 });
      expect(db.property.deleteMany).not.toHaveBeenCalled();
    });

    it("with fresh, deletes only this source + account's records first", async () => {
      await load(dataset(), { fresh: true });

      for (const m of [db.workOrder, db.property, db.portfolio, db.contact]) {
        expect(m.deleteMany).toHaveBeenCalledWith({
          where: { source: "rentvine", externalId: { startsWith: "pmilighthouse:" } },
        });
      }
    });
  });

  describe("sync mode (the nightly live refresh)", () => {
    it("keeps existing tags when the source row carries none", async () => {
      await load(dataset({ properties: [prop({ tags: [] })] }), { mode: "sync" });

      expect(upsertArgs(db.property).update).not.toHaveProperty("tags");
      expect(upsertArgs(db.property).create).toHaveProperty("tags", ""); // new rows still get a value
    });

    it("updates tags when the source does carry them", async () => {
      await load(dataset({ properties: [prop({ tags: ["squatterwatch"] })] }), { mode: "sync" });
      expect(upsertArgs(db.property).update).toHaveProperty("tags", "squatterwatch");
    });

    it("never overwrites balances owned by the balance sync", async () => {
      await load(dataset(), { mode: "sync" });

      const { update, create } = upsertArgs(db.lease);
      expect(update).not.toHaveProperty("balanceDue");
      expect(update).not.toHaveProperty("depositBalance");
      expect(create).toMatchObject({ balanceDue: 0, depositBalance: 2500 });
    });

    it("sweeps leases, units and properties that vanished from the source", async () => {
      await load(dataset(), { mode: "sync" });

      expect(db.lease.deleteMany).toHaveBeenCalledWith({
        where: { source: "rentvine", externalId: { startsWith: "pmilighthouse:lease:", notIn: ["pmilighthouse:lease:27"] } },
      });
      expect(db.unit.deleteMany).toHaveBeenCalledWith({
        where: { source: "rentvine", externalId: { startsWith: "pmilighthouse:unit:", notIn: ["pmilighthouse:unit:12-1"] } },
      });
      expect(db.property.deleteMany).toHaveBeenCalledWith({
        where: { source: "rentvine", externalId: { startsWith: "pmilighthouse:property:", notIn: ["pmilighthouse:property:12"] } },
      });
      expect(db.workOrder.deleteMany).not.toHaveBeenCalled();
    });

    it("does not sweep anything when the source returned no properties (API hiccup guard)", async () => {
      await load(dataset({ properties: [] }), { mode: "sync" });

      for (const m of [db.lease, db.unit, db.property]) expect(m.deleteMany).not.toHaveBeenCalled();
    });
  });
});
