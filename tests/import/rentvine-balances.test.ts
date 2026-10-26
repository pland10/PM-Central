import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBalanceProvider } from "@/import/sources/balances";
import { RentvineRestProvider } from "@/import/sources/rentvine/balances";
import { jsonResponse, stubFetch } from "../helpers/fetch";

beforeEach(() => {
  vi.stubEnv("RENTVINE_BASE_URL", "https://acct.rentvine.com/api/manager/");
  vi.stubEnv("RENTVINE_API_KEY", "key");
  vi.stubEnv("RENTVINE_API_SECRET", "secret");
});

describe("RentvineRestProvider", () => {
  it("requests the saved rent-roll report (default id 27) with basic auth", async () => {
    const fetchMock = stubFetch([[/\/reports\/rent-roll$/, jsonResponse({ rows: [] })]]);

    await new RentvineRestProvider().getBalances();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://acct.rentvine.com/api/manager/reports/rent-roll?exportTypeID=1&orientation=2&showHeader=true&reportID=27"
    );
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("key:secret").toString("base64")}`
    );
  });

  it("honors RENTVINE_BALANCE_REPORT_ID", async () => {
    vi.stubEnv("RENTVINE_BALANCE_REPORT_ID", "99");
    const fetchMock = stubFetch([[/\/reports\/rent-roll$/, jsonResponse({ rows: [] })]]);
    await new RentvineRestProvider().getBalances();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/reportID=99$/);
  });

  it("keys balances by lease id and parses money strings", async () => {
    stubFetch([
      [
        /\/reports\/rent-roll$/,
        jsonResponse({
          rows: [
            { rowTypeID: 3, data: { leaseID: "27", balanceDue: "$1,250.00" } },
            { rowTypeID: 3, data: { leaseID: "30", balanceDue: "0.00" } },
            { rowTypeID: 4, data: { balanceDue: "1250.00" } }, // totals row: no lease id
          ],
        }),
      ],
    ]);

    const balances = await new RentvineRestProvider().getBalances();

    expect([...balances.entries()]).toEqual([
      ["27", 1250],
      ["30", 0],
    ]);
  });

  it("accepts a flat array of rows too", async () => {
    stubFetch([[/\/reports\/rent-roll$/, jsonResponse([{ leaseId: 5, balanceDue: 10 }])]]);
    const balances = await new RentvineRestProvider().getBalances();
    expect(balances.get("5")).toBe(10);
  });

  it("throws a helpful error when credentials are missing", async () => {
    vi.stubEnv("RENTVINE_API_SECRET", "");
    await expect(new RentvineRestProvider().getBalances()).rejects.toThrow(/Missing Rentvine credentials/);
  });

  it("throws on an HTTP error", async () => {
    stubFetch([[/\/reports\/rent-roll$/, jsonResponse({}, { status: 401 })]]);
    await expect(new RentvineRestProvider().getBalances()).rejects.toThrow(/HTTP 401/);
  });
});

describe("getBalanceProvider", () => {
  it("defaults to Rentvine", () => {
    expect(getBalanceProvider().name).toBe("rentvine");
  });

  it("rejects an unknown provider by name", () => {
    expect(() => getBalanceProvider("appfolio")).toThrow(/Unknown PMS provider "appfolio"/);
  });
});
