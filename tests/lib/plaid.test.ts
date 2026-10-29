import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPlaidConfigured,
  plaidBaseUrl,
  normalizeTransaction,
  syncTransactions,
  type PlaidRawTransaction,
} from "@/lib/plaid";

beforeEach(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "cid");
  vi.stubEnv("PLAID_SECRET", "sec");
  vi.stubEnv("PLAID_ENV", "sandbox");
});

afterEach(() => vi.unstubAllEnvs());

describe("isPlaidConfigured", () => {
  it("needs both client id and secret", () => {
    expect(isPlaidConfigured()).toBe(true);
    vi.stubEnv("PLAID_SECRET", "");
    expect(isPlaidConfigured()).toBe(false);
  });
});

describe("plaidBaseUrl", () => {
  it("maps PLAID_ENV to the host, defaulting to sandbox", () => {
    expect(plaidBaseUrl()).toBe("https://sandbox.plaid.com");
    vi.stubEnv("PLAID_ENV", "production");
    expect(plaidBaseUrl()).toBe("https://production.plaid.com");
    vi.stubEnv("PLAID_ENV", "");
    expect(plaidBaseUrl()).toBe("https://sandbox.plaid.com");
  });
});

describe("normalizeTransaction", () => {
  const raw: PlaidRawTransaction = {
    transaction_id: "txn_1",
    account_id: "acc_1",
    name: "HOMEDEPOT #1234",
    merchant_name: "The Home Depot",
    amount: 54.23,
    iso_currency_code: "USD",
    date: "2026-10-27",
    authorized_date: "2026-10-26",
    payment_channel: "in store",
    pending: false,
    personal_finance_category: { primary: "HOME_IMPROVEMENT", detailed: "HOME_IMPROVEMENT_HARDWARE" },
  };

  it("maps the fields and resolves a friendly account name", () => {
    const row = normalizeTransaction(raw, { acc_1: "Home Depot" });
    expect(row).toMatchObject({
      transactionId: "txn_1",
      accountId: "acc_1",
      accountName: "Home Depot",
      merchantName: "The Home Depot",
      amount: 54.23,
      isoCurrencyCode: "USD",
      postedDate: "2026-10-27",
      authorizedDate: "2026-10-26",
      category: "HOME_IMPROVEMENT",
      categoryDetail: "HOME_IMPROVEMENT_HARDWARE",
      paymentChannel: "in store",
      pending: false,
    });
  });

  it("falls back: account id for unknown account, raw name for missing merchant, USD currency", () => {
    const row = normalizeTransaction({
      transaction_id: "txn_2",
      account_id: "acc_x",
      name: "SOME CHARGE",
      merchant_name: null,
      amount: 10,
      iso_currency_code: null,
      date: null,
    });
    expect(row.accountName).toBe("acc_x");
    expect(row.merchantName).toBe("SOME CHARGE");
    expect(row.isoCurrencyCode).toBe("USD");
    expect(row.postedDate).toBeNull();
    expect(row.category).toBe("");
  });
});

describe("syncTransactions", () => {
  function mockPages(pages: unknown[]) {
    const fetchMock = vi.fn();
    for (const p of pages) {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => p, text: async () => "" });
    }
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("follows the cursor until has_more is false and returns the final cursor", async () => {
    const fetchMock = mockPages([
      { added: [{ transaction_id: "a1" }], modified: [], removed: [], next_cursor: "c1", has_more: true },
      {
        added: [{ transaction_id: "a2" }],
        modified: [{ transaction_id: "m1" }],
        removed: [{ transaction_id: "r1" }],
        next_cursor: "c2",
        has_more: false,
      },
    ]);

    const result = await syncTransactions("access-token", "");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.added.map((t) => t.transaction_id)).toEqual(["a1", "a2"]);
    expect(result.modified.map((t) => t.transaction_id)).toEqual(["m1"]);
    expect(result.removed).toEqual(["r1"]);
    expect(result.cursor).toBe("c2");

    // Second call sends the cursor from the first page and the access token.
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(body.cursor).toBe("c1");
    expect(body.access_token).toBe("access-token");
    expect(body.client_id).toBe("cid");
  });

  it("surfaces a Plaid HTTP error with its status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}), text: async () => "bad" })
    );
    await expect(syncTransactions("t", "")).rejects.toMatchObject({ status: 400 });
  });
});
