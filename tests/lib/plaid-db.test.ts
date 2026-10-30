import { afterEach, describe, expect, it, vi } from "vitest";

// $executeRawUnsafe backs the annotation-column ensure-guard fetchPlaidTransactions runs first.
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRawUnsafe: vi.fn().mockResolvedValue(1) },
}));

import { prisma } from "@/lib/prisma";
import { fetchPlaidTransactions } from "@/lib/plaid-db";

const queryRaw = vi.mocked(prisma.$queryRaw);

afterEach(() => vi.clearAllMocks());

const raw = (over: Record<string, unknown> = {}) => ({
  transaction_id: "t1",
  posted_date: new Date("2026-10-27T00:00:00Z"),
  account_name: "American Express",
  merchant_name: "The Home Depot",
  name: "HOMEDEPOT #1234",
  amount: 54.23,
  category: "HOME_IMPROVEMENT",
  pending: false,
  reimbursable: null,
  category_override: null,
  recorded_quickbooks: false,
  recorded_rentvine: false,
  notes: null,
  ...over,
});

describe("fetchPlaidTransactions", () => {
  it("maps rows, lists distinct accounts, and returns the linked count", async () => {
    queryRaw
      .mockResolvedValueOnce([
        raw(),
        raw({ transaction_id: "t2", account_name: "The Home Depot", merchant_name: null, amount: 12, posted_date: new Date("2026-10-20T00:00:00Z") }),
      ])
      .mockResolvedValueOnce([{ n: 2 }]);

    const res = await fetchPlaidTransactions();

    expect(res.linkedCount).toBe(2);
    expect(res.accounts).toEqual(["American Express", "The Home Depot"]);
    expect(res.rows[0]).toMatchObject({
      transactionId: "t1",
      postedDate: "2026-10-27",
      merchantName: "The Home Depot",
      amount: 54.23,
    });
    // merchant falls back to the raw name when merchant_name is null
    expect(res.rows[1].merchantName).toBe("HOMEDEPOT #1234");
  });

  it("maps the hand-entered annotation columns", async () => {
    queryRaw
      .mockResolvedValueOnce([
        raw({
          reimbursable: "yes",
          category_override: "Supplies",
          recorded_quickbooks: true,
          recorded_rentvine: false,
          notes: "owner to repay",
        }),
      ])
      .mockResolvedValueOnce([{ n: 1 }]);

    const res = await fetchPlaidTransactions();

    expect(res.rows[0]).toMatchObject({
      reimbursable: "yes",
      categoryOverride: "Supplies",
      recordedQuickbooks: true,
      recordedRentvine: false,
      notes: "owner to repay",
    });
  });

  it("defaults annotations when unset (null in the DB)", async () => {
    queryRaw.mockResolvedValueOnce([raw()]).mockResolvedValueOnce([{ n: 1 }]);
    const res = await fetchPlaidTransactions();
    expect(res.rows[0]).toMatchObject({
      reimbursable: null,
      categoryOverride: "",
      recordedQuickbooks: false,
      recordedRentvine: false,
      notes: "",
    });
  });

  it("degrades to an empty result when the table doesn't exist yet", async () => {
    queryRaw.mockRejectedValueOnce(new Error('relation "plaid_transactions" does not exist'));

    const res = await fetchPlaidTransactions();

    expect(res).toEqual({ rows: [], accounts: [], linkedCount: 0 });
  });

  it("still returns transactions when the items count query fails", async () => {
    queryRaw
      .mockResolvedValueOnce([raw()])
      .mockRejectedValueOnce(new Error('relation "plaid_items" does not exist'));

    const res = await fetchPlaidTransactions();

    expect(res.rows).toHaveLength(1);
    expect(res.linkedCount).toBe(0);
  });
});
