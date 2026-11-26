import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { jsonResponse, stubFetch } from "../helpers/fetch";
import { loadOwnerDrawData, reportRetry } from "@/lib/owner-draws-rentvine";

const balances = {
  rows: [
    {
      rowTypeID: 3,
      data: {
        portfolioID: "75",
        portfolioName: "Grant Holdings",
        contacts: JSON.stringify([{ name: "Ann Owner", percentOwned: "100" }]),
        operatingBalance: "500.00",
        totalReserveAmount: "500.00",
        accountsPayableBalance: "370.32",
        holdDistributions: "0",
      },
    },
    { rowTypeID: 4, data: { operatingBalance: "1" } },
  ],
};
const payables = {
  rows: [
    { rowTypeID: 3, data: { portfolioID: "75", billID: "3018", description: "Leak", amountUnpaid: "345.32", dateDue: "2026-11-19", isVoided: "0" } },
    { rowTypeID: 3, data: { portfolioID: "75", billID: "3000", description: "Notice", amountUnpaid: "25.00", dateDue: "2026-11-14", isVoided: "0" } },
    { rowTypeID: 3, data: { portfolioID: "75", billID: "1", description: "Old", amountUnpaid: "99", isVoided: "1" } },
  ],
};

describe("loadOwnerDrawData", () => {
  beforeEach(() => {
    vi.stubEnv("RENTVINE_API_KEY", "k");
    vi.stubEnv("RENTVINE_API_SECRET", "s");
    vi.stubEnv("RENTVINE_BASE_URL", "https://rv.example/api/manager");
    reportRetry.sleep = async () => {}; // retries without the real backoff wait
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads both reports and itemizes each portfolio's unpaid bills", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const res = await loadOwnerDrawData();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.portfolios).toHaveLength(1);
    expect(res.portfolios[0]).toMatchObject({ portfolioId: "75", name: "Grant Holdings", unpaid: 370.32 });
    expect(res.bills.get("75")!.map((b) => b.billId)).toEqual(["3018", "3000"]);

    // Payables asks for unpaid, non-voided lines.
    const payUrl = fetchMock.mock.calls.map((c) => new URL(String(c[0]))).find((u) => u.pathname.endsWith("payables"))!;
    const body = JSON.parse(payUrl.searchParams.get("json")!);
    expect(body.filters).toEqual(
      expect.arrayContaining([
        { name: "isPaid", comparator: "booleanFalse" },
        { name: "isVoided", comparator: "booleanFalse" },
      ])
    );
  });

  it("filters both reports to one portfolio when asked", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    await loadOwnerDrawData("75");
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(new URL(String(call[0])).searchParams.get("json")!);
      expect(body.filters).toContainEqual({ name: "portfolioID", comparator: "equals", value: "75" });
    }
  });

  it("retries when Rentvine rate-limits (HTTP 429), then loads", async () => {
    let balanceCalls = 0;
    stubFetch([
      [/reports\/portfolio-balances$/, () => (++balanceCalls === 1 ? jsonResponse("slow down", { status: 429 }) : jsonResponse(balances))],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const res = await loadOwnerDrawData();
    expect(res.ok).toBe(true);
    expect(balanceCalls).toBe(2);
  });

  it("returns an error result when Rentvine fails", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse("boom", { status: 500 })],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const res = await loadOwnerDrawData();
    expect(res).toMatchObject({ ok: false, status: 500 });
    // A persistent 5xx is retried (4 tries) before giving up.
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("portfolio-balances"))).toHaveLength(4);
  });

  it("says so when Rentvine isn't configured", async () => {
    vi.stubEnv("RENTVINE_API_KEY", "");
    const res = await loadOwnerDrawData();
    expect(res).toMatchObject({ ok: false, status: 503 });
  });
});
