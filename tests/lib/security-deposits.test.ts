import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSecurityDeposits, isRentvineConfigured } from "@/lib/security-deposits";

type Data = Record<string, string>;
const dataRow = (d: Data) => ({ rowTypeID: 3, data: d });

function lease(over: Data): Data {
  return {
    leaseID: "1",
    propertyID: "10",
    unitAddress: "1 Main St",
    portfolioName: "Owner LLC",
    primaryTenantName: "Tenant",
    leaseStatusName: "Active",
    moveOutDate: "",
    securityDepositBalance: "0.00",
    heldSecurityDepositBalance: "0.00",
    ownerHeldSecurityDepositBalance: "0.00",
    ...over,
  };
}

function mockReport(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("RENTVINE_API_KEY", "key");
  vi.stubEnv("RENTVINE_API_SECRET", "secret");
  vi.stubEnv("RENTVINE_BASE_URL", "https://acct.rentvine.com/api/manager/");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("isRentvineConfigured", () => {
  it("needs both the key and the secret", () => {
    expect(isRentvineConfigured()).toBe(true);
    vi.stubEnv("RENTVINE_API_SECRET", "");
    expect(isRentvineConfigured()).toBe(false);
  });
});

describe("fetchSecurityDeposits", () => {
  it("calls the deposit-balance report with basic auth and the display columns", async () => {
    const fetchMock = mockReport({ rows: [] });

    await fetchSecurityDeposits();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/acct\.rentvine\.com\/api\/manager\/reports\/lease-security-deposit-balance\?exportTypeID=1&json=/);
    const json = JSON.parse(decodeURIComponent(String(url).split("json=")[1]));
    expect(json.displayColumns).toContain("heldSecurityDepositBalance");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    expect(init.cache).toBe("no-store");
  });

  it("splits PMI-held (active vs moved-out) from owner-held, skipping zero and totals rows", async () => {
    mockReport({
      rows: [
        dataRow(lease({ leaseID: "1", securityDepositBalance: "2500.00", heldSecurityDepositBalance: "2500.00" })),
        dataRow(
          lease({
            leaseID: "2",
            leaseStatusName: "Closed",
            securityDepositBalance: "2550.00",
            heldSecurityDepositBalance: "2550.00",
          })
        ),
        dataRow(
          lease({ leaseID: "3", securityDepositBalance: "1800.00", ownerHeldSecurityDepositBalance: "1800.00" })
        ),
        dataRow(lease({ leaseID: "4" })), // all zero → skipped
        { rowTypeID: 4, data: lease({ securityDepositBalance: "6850.00" }) }, // totals row
      ],
    });

    const result = await fetchSecurityDeposits();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.leaseId)).toEqual(["2", "1", "3"]); // biggest balance first
    expect(result.summary).toEqual({
      reportTotal: 6850,
      pmiHeldActive: 2500,
      pmiHeldMovedOut: 2550,
      ownerHeld: 1800,
    });
    expect(result.rows.find((r) => r.leaseId === "3")!.holder).toBe("owner");
    expect(result.rows.find((r) => r.leaseId === "1")!.holder).toBe("pmi");
  });

  it.each([
    ["status Closed", { leaseStatusName: "Closed" }, true],
    ["status Moved Out", { leaseStatusName: "Moved Out" }, true],
    ["status Evicted", { leaseStatusName: "Evicted" }, true],
    ["a past move-out date", { moveOutDate: "2026-09-30" }, true],
    ["a future move-out date", { moveOutDate: "2026-12-31" }, false],
    ["an active lease", {}, false],
  ])("treats a lease with %s as moved out = %s", async (_label, over, movedOut) => {
    mockReport({
      rows: [dataRow(lease({ ...(over as Data), securityDepositBalance: "100", heldSecurityDepositBalance: "100" }))],
    });

    const result = await fetchSecurityDeposits();

    expect(result.ok && result.rows[0].movedOut).toBe(movedOut);
  });

  it("parses money strings with symbols and separators", async () => {
    mockReport({
      rows: [dataRow(lease({ securityDepositBalance: "$1,250.50", heldSecurityDepositBalance: "$1,250.50" }))],
    });

    const result = await fetchSecurityDeposits();

    expect(result.ok && result.summary.pmiHeldActive).toBe(1250.5);
  });

  it("uses the report's 'as of' filter when present", async () => {
    mockReport({ rows: [], displayFilters: [{ label: "As Of", details: " Oct 24, 2026 " }] });
    const result = await fetchSecurityDeposits();
    expect(result.ok && result.asOf).toBe("Oct 24, 2026");
  });

  it("returns 503 without calling Rentvine when credentials are missing", async () => {
    vi.stubEnv("RENTVINE_API_KEY", "");
    const fetchMock = mockReport({ rows: [] });

    const result = await fetchSecurityDeposits();

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes through a Rentvine HTTP error", async () => {
    mockReport({ message: "Unauthorized" }, 401);
    const result = await fetchSecurityDeposits();
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("returns 502 when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const result = await fetchSecurityDeposits();
    expect(result).toEqual({ ok: false, status: 502, error: "socket hang up" });
  });
});
