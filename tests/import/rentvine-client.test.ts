import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountConfigFromEnv,
  fetchRentvineUnits,
  fetchRentvineWorkOrders,
  liveRentvineSource,
  type RentvineAccountConfig,
} from "@/import/sources/rentvine/client";
import { jsonResponse, stubFetch } from "../helpers/fetch";

const config: RentvineAccountConfig = {
  account: "pmilighthouse",
  subdomain: "pmilighthouse",
  apiKey: "key",
  apiSecret: "secret",
  rentRollReportId: "10",
};

const onePage = (rows: unknown[]) => jsonResponse(rows, { headers: { "Pagination-Total-Pages": "1" } });

const leaseRow = (id: string, over: Record<string, unknown> = {}) => ({
  lease: {
    leaseID: id,
    propertyID: "12",
    primaryLeaseStatusID: "2",
    tenants: ["Tenant " + id],
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    ...over,
  },
  unit: { rent: "2500.00", deposit: "2500.00" },
});

const renewal = (leaseID: string, endDate: string) => ({ renewal: { leaseID, startDate: "x", endDate }, token: "t" });

// A Rentvine account with one property, one portfolio and the given leases and
// renewals. Tenant lookups fail unless a lease id is listed in `tenantContacts`.
function stubAccount({
  leases = [leaseRow("27")],
  renewals = [] as unknown[],
  renewalsStatus = 200,
  tenantContacts = {} as Record<string, unknown[]>,
  groupList = null as unknown[] | null, // null → /properties/groups 404s
  memberships = {} as Record<string, unknown[]>, // propertyID → groupProperty rows; missing → 500
  rentRoll = null as { leaseID: string; expectedMonthlyRentAmount: string }[] | null, // null → report 404s
} = {}) {
  return stubFetch([
    [/\/reports\/rent-roll/, rentRoll ? jsonResponse({ rows: rentRoll.map((d) => ({ rowTypeID: 3, data: d })) }) : jsonResponse({}, { status: 404 })],
    [/\/properties\/groups$/, groupList ? onePage(groupList) : jsonResponse({}, { status: 404 })],
    [
      /\/properties\/(\d+)\/groups$/,
      (url) => {
        const id = url.pathname.match(/properties\/(\d+)\/groups/)![1];
        return memberships[id] ? onePage(memberships[id]) : jsonResponse({}, { status: 500 });
      },
    ],
    [/\/properties$/, onePage([{ property: { propertyID: "12", address: "66 Francis Court", city: "Elmont", stateID: "NY", postalCode: "11003", propertyTypeID: "1", portfolioID: "3", isActive: "1" } }])],
    [/\/portfolios$/, onePage([{ portfolio: { portfolioID: "3", name: "Owner LLC" } }])],
    [/\/leases$/, onePage(leases)],
    [/\/leases\/\d+\/renewals$/, renewalsStatus === 200 ? onePage(renewals) : jsonResponse({}, { status: renewalsStatus })],
    [
      /\/leases\/(\d+)\/tenants$/,
      (url) => {
        const id = url.pathname.match(/leases\/(\d+)\/tenants/)![1];
        return tenantContacts[id] ? jsonResponse(tenantContacts[id]) : jsonResponse({}, { status: 500 });
      },
    ],
  ]);
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("accountConfigFromEnv", () => {
  it("prefers account-specific variables over generic ones", () => {
    vi.stubEnv("RENTVINE_API_KEY", "generic-key");
    vi.stubEnv("RENTVINE_PMILIGHTHOUSE_API_KEY", "account-key");
    vi.stubEnv("RENTVINE_API_SECRET", "generic-secret");

    expect(accountConfigFromEnv("pmilighthouse")).toEqual({
      account: "pmilighthouse",
      subdomain: "pmilighthouse",
      apiKey: "account-key",
      apiSecret: "generic-secret",
      rentRollReportId: "10",
    });
  });
});

describe("liveRentvineSource.extract", () => {
  it("refuses to run without credentials", async () => {
    await expect(liveRentvineSource({ ...config, apiSecret: "" }).extract()).rejects.toThrow(/credentials missing/);
  });

  it("maps properties with their owner and a fallback type name", async () => {
    stubAccount();

    const out = await liveRentvineSource(config).extract();

    expect(out.properties).toEqual([
      {
        id: 12,
        street: "66 Francis Court",
        city: "Elmont",
        state: "NY",
        zip: "11003",
        type: "Single Family Home", // /property-types 404s → built-in map
        portfolioId: 3,
        owner: "Owner LLC",
        status: "active",
      },
    ]);
    expect(out.workOrders).toEqual([]); // synced separately; never wiped here
  });

  describe("property groups", () => {
    const groupList = [
      { propertyGroup: { propertyGroupID: "4", name: "Squatterwatch Properties" }, token: "t" },
      { propertyGroup: { propertyGroupID: "7", name: "SureVestor Landlord Protection" }, token: "t" },
    ];
    const member = (groupID: string) => ({ groupProperty: { groupPropertyID: "1", propertyGroupID: groupID, propertyID: "12" }, token: "t" });

    it("reads each property's group names from its membership", async () => {
      stubAccount({ groupList, memberships: { "12": [member("4")] } });

      const out = await liveRentvineSource(config).extract();

      expect(out.properties[0].groups).toEqual(["Squatterwatch Properties"]);
    });

    it("reports an empty list for a property in no groups, so its tags clear", async () => {
      stubAccount({ groupList, memberships: { "12": [] } });

      const out = await liveRentvineSource(config).extract();

      expect(out.properties[0].groups).toEqual([]);
    });

    it("leaves groups unknown when the membership lookup fails, so tags are kept", async () => {
      stubAccount({ groupList, memberships: {} });

      const out = await liveRentvineSource(config).extract();

      expect(out.properties[0].groups).toBeUndefined();
    });

    it("leaves every property's groups unknown when the group list is unavailable", async () => {
      stubAccount({ groupList: null, memberships: { "12": [member("4")] } });

      const out = await liveRentvineSource(config).extract();

      expect(out.properties[0].groups).toBeUndefined();
    });
  });

  it("keeps only active leases", async () => {
    stubAccount({ leases: [leaseRow("27"), leaseRow("28", { primaryLeaseStatusID: "6" }), leaseRow("29", { primaryLeaseStatusID: "1" })] });

    const out = await liveRentvineSource(config).extract();

    expect(out.activeLeases.map((l) => l.leaseId)).toEqual([27]);
    expect(out.activeLeases[0]).toMatchObject({ prop: 12, rent: 2500, depositBalance: 2500 });
  });

  it("takes current rent from the Rent Roll report, falling back to the unit rent when the report has none (the 5 Ring Ln case)", async () => {
    // The unit's listing rent lags ($2500 here) after a renewal; the Rent Roll
    // report carries the real $4100. Lease 27 isn't in the report → unit rent.
    stubAccount({
      leases: [leaseRow("6"), leaseRow("27")],
      rentRoll: [{ leaseID: "6", expectedMonthlyRentAmount: "$4,100.00" }],
    });

    const out = await liveRentvineSource(config).extract();
    const rentById = Object.fromEntries(out.activeLeases.map((l) => [l.leaseId, l.rent]));
    expect(rentById[6]).toBe(4100); // report rent beats the stale unit rent
    expect(rentById[27]).toBe(2500); // not in report → unit rent, unchanged
  });

  it("enriches the primary tenant's contact details, keeping the name when lookup fails", async () => {
    stubAccount({
      leases: [leaseRow("27"), leaseRow("28")],
      tenantContacts: {
        "27": [
          { leaseTenant: { isPrimary: "0" }, contact: { name: "Co-signer", email: "co@example.com" } },
          { leaseTenant: { isPrimary: "1" }, contact: { name: "Pamela Roberts", email: "p@example.com", phone: "+15550001" } },
        ],
      },
    });

    const out = await liveRentvineSource(config).extract();

    expect(out.activeLeases[0]).toMatchObject({ tenant: "Pamela Roberts", email: "p@example.com", phone: "+15550001" });
    expect(out.activeLeases[1]).toMatchObject({ tenant: "Tenant 28" });
    expect(out.activeLeases[1].email).toBeUndefined();
  });

  describe("renewal correction", () => {
    it("replaces a stale lease end with the renewal end (lease 27 / Pamela)", async () => {
      stubAccount({
        leases: [leaseRow("27", { startDate: "2026-04-01", endDate: "2026-03-31" })],
        renewals: [renewal("27", "2027-03-31")],
      });

      const out = await liveRentvineSource(config).extract();

      expect(out.activeLeases[0].end).toBe("2027-03-31");
      expect(console.log).toHaveBeenCalledWith("[renewal] lease 27: end 2026-03-31 -> 2027-03-31");
    });

    it("uses only the lease's own renewals, from the collection the endpoint returns", async () => {
      stubAccount({
        leases: [leaseRow("27"), leaseRow("30", { endDate: "2026-12-31" })],
        // /leases/{id}/renewals ignores the id and returns every renewal
        renewals: [renewal("19", "2028-09-30"), renewal("27", "2027-03-31")],
      });

      const out = await liveRentvineSource(config).extract();

      expect(out.activeLeases.find((l) => l.leaseId === 27)!.end).toBe("2027-03-31");
      expect(out.activeLeases.find((l) => l.leaseId === 30)!.end).toBe("2026-12-31");
    });

    it("takes the latest of several renewals and normalizes datetimes", async () => {
      stubAccount({
        renewals: [renewal("27", "2026-09-30"), renewal("27", "2028-01-31 00:00:00"), renewal("27", "2027-03-31")],
      });

      const out = await liveRentvineSource(config).extract();

      expect(out.activeLeases[0].end).toBe("2028-01-31");
    });

    it("never moves an end date earlier", async () => {
      stubAccount({
        leases: [leaseRow("27", { endDate: "2027-06-30" })],
        renewals: [renewal("27", "2027-03-31")],
      });

      const out = await liveRentvineSource(config).extract();

      expect(out.activeLeases[0].end).toBe("2027-06-30");
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("[renewal]"));
    });

    it("keeps lease ends when the renewals endpoint fails", async () => {
      stubAccount({ renewalsStatus: 500 });

      const out = await liveRentvineSource(config).extract();

      expect(out.activeLeases[0].end).toBe("2026-03-31");
    });
  });

  it("follows Pagination-Total-Pages across pages", async () => {
    stubFetch([
      [/\/properties$/, onePage([])],
      [/\/portfolios$/, onePage([])],
      [/\/leases\/\d+\/renewals$/, onePage([])],
      [
        /\/leases$/,
        (url) =>
          jsonResponse(url.searchParams.get("page") === "1" ? [leaseRow("1")] : [leaseRow("2")], {
            headers: { "Pagination-Total-Pages": "2" },
          }),
      ],
    ]);

    const out = await liveRentvineSource(config).extract();

    expect(out.activeLeases.map((l) => l.leaseId)).toEqual([1, 2]);
  });
});

describe("fetchRentvineWorkOrders", () => {
  it("maps priority ids to names and skips rows without a number", async () => {
    stubFetch([
      [
        /\/maintenance\/work-orders$/,
        onePage([
          { workOrder: { workOrderNumber: "301", propertyID: "12", priorityID: "3" } },
          { workOrder: { workOrderNumber: "302", propertyID: "12", priorityID: "1" } },
          { workOrder: { workOrderNumber: "303", propertyID: "13", priorityID: "9" } },
          { workOrder: { workOrderNumber: "", propertyID: "13", priorityID: "2" } },
        ]),
      ],
    ]);

    expect(await fetchRentvineWorkOrders(config)).toEqual([
      { number: "301", propertyExternalId: "12", priority: "High" },
      { number: "302", propertyExternalId: "12", priority: "Low" },
      { number: "303", propertyExternalId: "13", priority: "" },
    ]);
  });

  it("refuses to run without credentials", async () => {
    await expect(fetchRentvineWorkOrders({ ...config, apiKey: "" })).rejects.toThrow(/credentials missing/);
  });
});

describe("fetchRentvineUnits", () => {
  it("maps every unit (all pages) with its property and active flag", async () => {
    stubFetch([
      [
        /\/properties\/units$/,
        onePage([
          { unit: { unitID: "45", propertyID: "48", name: "Unit 1", isActive: "1", dateTimeDeactivated: null }, token: "t" },
          { unit: { unitID: "46", propertyID: "48", name: "Unit 2", isActive: "1", dateTimeDeactivated: "" }, token: "t" },
          { unit: { unitID: "47", propertyID: "48", name: "Unit 3", isActive: "0", dateTimeDeactivated: "2026-01-01 00:00:00" }, token: "t" },
          { unit: { unitID: "", propertyID: "48", name: "ghost", isActive: "1" }, token: "t" },
        ]),
      ],
    ]);

    expect(await fetchRentvineUnits(config)).toEqual([
      { unitId: "45", propertyExternalId: "48", name: "Unit 1", active: true },
      { unitId: "46", propertyExternalId: "48", name: "Unit 2", active: true },
      { unitId: "47", propertyExternalId: "48", name: "Unit 3", active: false },
    ]);
  });

  it("refuses to run without credentials", async () => {
    await expect(fetchRentvineUnits({ ...config, apiSecret: "" })).rejects.toThrow(/credentials missing/);
  });
});
