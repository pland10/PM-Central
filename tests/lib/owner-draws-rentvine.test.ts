import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { jsonResponse, stubFetch } from "../helpers/fetch";
import { clearOwnerDrawCache, loadOwnerDrawData, reportRetry } from "@/lib/owner-draws-rentvine";

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
    clearOwnerDrawCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    // A persistent 5xx is retried (5 tries) before giving up.
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("portfolio-balances"))).toHaveLength(5);
  });

  it("says so when Rentvine isn't configured", async () => {
    vi.stubEnv("RENTVINE_API_KEY", "");
    const res = await loadOwnerDrawData();
    expect(res).toMatchObject({ ok: false, status: 503 });
  });

  it("runs the two reports one after the other, not at the same time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = (body: unknown) => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return jsonResponse(body);
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => (String(input).includes("portfolio-balances") ? slow(balances)() : slow(payables)()))
    );
    const res = await loadOwnerDrawData();
    expect(res.ok).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it("serves a reload within a few minutes from cache (no new Rentvine calls)", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const first = await loadOwnerDrawData();
    const second = await loadOwnerDrawData();
    expect(fetchMock).toHaveBeenCalledTimes(2); // one call per report, once
    expect(second.ok && first.ok && second.asOf).toBe(first.ok && first.asOf);
  });

  it("refetches once the cache is older than the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    await loadOwnerDrawData();
    vi.setSystemTime(new Date("2026-11-27T12:06:00Z"));
    await loadOwnerDrawData();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fresh: true skips the cache (Refresh button, approve snapshot)", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    await loadOwnerDrawData();
    await loadOwnerDrawData(undefined, { fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("caches each portfolio filter separately", async () => {
    const fetchMock = stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse(balances)],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    await loadOwnerDrawData();
    await loadOwnerDrawData("75");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("if Rentvine is busy, falls back to the last good figures and says how old they are", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
    let busy = false;
    stubFetch([
      [/reports\/portfolio-balances$/, () => (busy ? jsonResponse("slow down", { status: 429 }) : jsonResponse(balances))],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const good = await loadOwnerDrawData();
    vi.setSystemTime(new Date("2026-11-27T12:20:00Z"));
    busy = true;
    const res = await loadOwnerDrawData();
    expect(res).toMatchObject({ ok: true, stale: true, staleReason: expect.stringMatching(/busy/i) });
    expect(res.ok && res.asOf).toBe(good.ok && good.asOf);
  });

  it("a 429 with nothing cached comes back as a friendly 'busy' error", async () => {
    stubFetch([
      [/reports\/portfolio-balances$/, jsonResponse("slow down", { status: 429 })],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    const res = await loadOwnerDrawData();
    expect(res).toMatchObject({ ok: false, status: 429, busy: true });
    expect(!res.ok && res.error).toMatch(/busy/i);
  });

  it("never caches a failure", async () => {
    let fail = true;
    stubFetch([
      [/reports\/portfolio-balances$/, () => (fail ? jsonResponse("boom", { status: 500 }) : jsonResponse(balances))],
      [/reports\/payables$/, jsonResponse(payables)],
    ]);
    expect((await loadOwnerDrawData()).ok).toBe(false);
    fail = false;
    expect((await loadOwnerDrawData()).ok).toBe(true);
  });
});
