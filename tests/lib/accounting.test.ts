import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CASH_ACCOUNTS,
  fetchCashOnHand,
  fetchReimbursables,
  fetchMoneyOut,
  fetchManagementDraws,
  mapMoneyOut,
  paymentMethodLabel,
  payeeTypeLabel,
  isRentvineConfigured,
} from "@/lib/accounting";

type Data = Record<string, string>;
const dataRow = (d: Data) => ({ rowTypeID: 3, data: d });
const totalsRow = (d: Data) => ({ rowTypeID: 4, data: d });

function mockFetch(payload: unknown, status = 200) {
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
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("isRentvineConfigured", () => {
  it("needs both the key and the secret", () => {
    expect(isRentvineConfigured()).toBe(true);
    vi.stubEnv("RENTVINE_API_SECRET", "");
    expect(isRentvineConfigured()).toBe(false);
  });
});

describe("fetchCashOnHand", () => {
  it("runs the bank-balance-breakdown report once per active account with basic auth", async () => {
    const fetchMock = mockFetch({ rows: [] });

    await fetchCashOnHand();

    expect(fetchMock).toHaveBeenCalledTimes(CASH_ACCOUNTS.length);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/acct\.rentvine\.com\/api\/manager\/reports\/bank-balance-breakdown\?exportTypeID=1&json=/
    );
    const body = JSON.parse(decodeURIComponent(String(url).split("json=")[1]));
    expect(body.filters).toContainEqual({ name: "bankAccount", comparator: "equals", value: CASH_ACCOUNTS[0].id });
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    expect(init.cache).toBe("no-store");
  });

  it("sums the data rows per account (skipping the totals row) and totals across accounts", async () => {
    // Every account call returns the same payload: two data rows + a totals row.
    mockFetch({
      rows: [
        dataRow({ balance: "$33,000.00" }),
        dataRow({ balance: "326.18" }),
        totalsRow({ balance: "33326.18" }), // must be ignored, not double-counted
      ],
    });

    const result = await fetchCashOnHand();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accounts).toHaveLength(CASH_ACCOUNTS.length);
    expect(result.accounts[0].balance).toBe(33326.18);
    expect(result.total).toBeCloseTo(33326.18 * CASH_ACCOUNTS.length, 2);
  });

  it("returns 503 without calling Rentvine when credentials are missing", async () => {
    vi.stubEnv("RENTVINE_API_KEY", "");
    const fetchMock = mockFetch({ rows: [] });

    const result = await fetchCashOnHand();

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes through a Rentvine HTTP error", async () => {
    mockFetch({ message: "Unauthorized" }, 401);
    const result = await fetchCashOnHand();
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("returns 502 when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const result = await fetchCashOnHand();
    expect(result).toEqual({ ok: false, status: 502, error: "socket hang up" });
  });
});

describe("fetchReimbursables", () => {
  const ledgerRow = (over: Data) => dataRow({ datePosted: "October 1, 2026", description: "x", charges: "", payments: "", balance: "0.00", billReference: "", propertyName: "", ...over });

  it("runs the vendor-ledger report for the reimbursable vendor over all time", async () => {
    const fetchMock = mockFetch({ rows: [] });

    await fetchReimbursables();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/acct\.rentvine\.com\/api\/manager\/reports\/vendor-ledger\?exportTypeID=1&json=/
    );
    const body = JSON.parse(decodeURIComponent(String(url).split("json=")[1]));
    expect(body.filters).toContainEqual({ name: "vendorContactID", comparator: "equals", value: "503" });
    expect(body.filters).toContainEqual({ name: "datePosted", comparator: "allTime" });
  });

  it("computes outstanding as charges minus payments and keeps recent activity newest-first", async () => {
    mockFetch({
      rows: [
        ledgerRow({ datePosted: "October 13, 2026", description: "Ceiling Leak Repair", charges: "$3,000.00", billReference: "PMI-0026" }),
        ledgerRow({ datePosted: "October 23, 2026", description: "Ceiling Leak Repair", payments: "$3,000.00", billReference: "PMI-0026" }),
        ledgerRow({ datePosted: "October 20, 2026", description: "Mail", charges: "4.00" }),
        totalsRow({ charges: "", payments: "", balance: "0.00" }), // ignored
      ],
    });

    const result = await fetchReimbursables();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalCharges).toBe(3004);
    expect(result.totalPayments).toBe(3000);
    expect(result.outstanding).toBe(4); // 3004 charged - 3000 reimbursed
    // Recent activity newest first.
    expect(result.rows.map((r) => r.date)).toEqual(["October 23, 2026", "October 20, 2026", "October 13, 2026"]);
  });

  it("returns 503 when credentials are missing", async () => {
    vi.stubEnv("RENTVINE_API_SECRET", "");
    const result = await fetchReimbursables();
    expect(result).toMatchObject({ ok: false, status: 503 });
  });
});

describe("money out (check register)", () => {
  it("labels payment methods, using otherPayoutTypeID when the type is Other", () => {
    expect(paymentMethodLabel("2")).toBe("Check");
    expect(paymentMethodLabel("3")).toBe("eCheck (ACH)");
    expect(paymentMethodLabel("1", "3")).toBe("Bank Transfer"); // Other → otherPayoutType
    expect(paymentMethodLabel("1", undefined)).toBe("Other");
  });

  it("labels payee types", () => {
    expect(payeeTypeLabel("1")).toBe("Owner");
    expect(payeeTypeLabel("3")).toBe("Vendor");
    expect(payeeTypeLabel("4")).toBe("Manager");
    expect(payeeTypeLabel("99")).toBe("");
  });

  it("maps rows (payee is contactName, id is payoutID), totals the amount, newest first", () => {
    const { rows, total } = mapMoneyOut([
      dataRow({ payoutID: "p1", datePosted: "2026-08-07", contactName: "LIGHTHOUSE MAINTENANCE SERVICES LLC", contactTypeID: "3", payoutTypeID: "2", checkNumber: "31", memo: "", payoutAmount: "$314.29" }),
      dataRow({ payoutID: "p2", datePosted: "2026-08-20", contactName: "Neil Maclean", contactTypeID: "1", payoutTypeID: "3", memo: "Owner Distribution", payoutAmount: "4,484.30" }),
      totalsRow({ payoutAmount: "4798.59" }), // ignored
    ]);

    expect(total).toBe(4798.59);
    expect(rows.map((r) => r.date)).toEqual(["2026-08-20", "2026-08-07"]); // newest first
    expect(rows[0]).toEqual({
      payoutId: "p2",
      date: "2026-08-20",
      payee: "Neil Maclean",
      payeeType: "Owner",
      method: "eCheck (ACH)",
      checkNumber: "",
      memo: "Owner Distribution",
      amount: 4484.3,
    });
    expect(rows[1]).toMatchObject({ payoutId: "p1", payee: "LIGHTHOUSE MAINTENANCE SERVICES LLC", payeeType: "Vendor", method: "Check", checkNumber: "31" });
  });

  it("runs the check-register report over the last 90 days, voided excluded", async () => {
    const fetchMock = mockFetch({ rows: [] });

    await fetchMoneyOut();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/reports\/check-register\?exportTypeID=1&json=/);
    const body = JSON.parse(decodeURIComponent(String(url).split("json=")[1]));
    expect(body.filters).toContainEqual({ name: "datePosted", comparator: "last90Days" });
    expect(body.filters).toContainEqual({ name: "isVoided", comparator: "booleanFalse" });
    expect(body.displayColumns).toContain("payee");
  });

  it("returns 503 when credentials are missing", async () => {
    vi.stubEnv("RENTVINE_API_KEY", "");
    const result = await fetchMoneyOut();
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("passes through a Rentvine HTTP error", async () => {
    mockFetch({ message: "nope" }, 500);
    expect(await fetchMoneyOut()).toMatchObject({ ok: false, status: 500 });
  });

  it("fetchManagementDraws keeps only the PMI Lighthouse draw payees", async () => {
    mockFetch({
      rows: [
        dataRow({ payoutID: "1", datePosted: "2026-08-10", contactName: "PMI Lighthouse", payoutAmount: "100.00" }),
        dataRow({ payoutID: "2", datePosted: "2026-08-11", contactName: "PMI Lighthouse Reimbursable", payoutAmount: "50.00" }),
        dataRow({ payoutID: "3", datePosted: "2026-08-12", contactName: "Neil Maclean", payoutAmount: "999.00" }),
      ],
    });

    const res = await fetchManagementDraws();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => r.payee).sort()).toEqual(["PMI Lighthouse", "PMI Lighthouse Reimbursable"]);
    expect(res.count).toBe(2);
    expect(res.total).toBe(150);
  });
});
