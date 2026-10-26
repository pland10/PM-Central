import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountConfigFromEnv,
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
} = {}) {
  return stubFetch([
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

  it("keeps only active leases", async () => {
    stubAccount({ leases: [leaseRow("27"), leaseRow("28", { primaryLeaseStatusID: "6" }), leaseRow("29", { primaryLeaseStatusID: "1" })] });

    const out = await liveRentvineSource(config).extract();

    expect(out.activeLeases.map((l) => l.leaseId)).toEqual([27]);
    expect(out.activeLeases[0]).toMatchObject({ prop: 12, rent: 2500, depositBalance: 2500 });
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
