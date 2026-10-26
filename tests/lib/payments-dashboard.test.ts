import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { normalizeDate, paymentSummaryAsOf, todayStr } from "@/lib/payments-dashboard";

const queryRaw = vi.mocked(prisma.$queryRaw);

const line = (id: string, amount: number, over: Record<string, unknown> = {}) => ({
  source_id: id,
  tenant: `Tenant ${id}`,
  property_address: `${id} Main St`,
  amount,
  date_posted: "2026-10-20",
  clear_date: null,
  expected_clear: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("normalizeDate / todayStr", () => {
  it("keeps a valid YYYY-MM-DD and falls back to today otherwise", () => {
    expect(todayStr()).toBe("2026-10-24");
    expect(normalizeDate("2026-09-01")).toBe("2026-09-01");
    expect(normalizeDate("09/01/2026")).toBe("2026-10-24");
    expect(normalizeDate("2026-09-01'; DROP TABLE payments;--")).toBe("2026-10-24");
    expect(normalizeDate(null)).toBe("2026-10-24");
  });
});

describe("paymentSummaryAsOf", () => {
  it("groups cleared payments by owner and totals each category", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [
          /status = 'cleared'/,
          [
            { ...line("a", 2500, { clear_date: "2026-10-23" }), owner: "Owner LLC" },
            { ...line("b", 1000, { clear_date: "2026-10-24" }), owner: "Owner LLC" },
            { ...line("c", 1800, { clear_date: "2026-10-24" }), owner: null },
          ],
        ],
        [/status = 'pending'/, [line("p1", 3100, { date_posted: "2026-10-01" }), line("p2", 900, { date_posted: "2026-10-22" })]],
        [/status = 'returned'/, [line("r1", 2500)]],
      ]) as never
    );

    const s = await paymentSummaryAsOf("2026-10-24");

    expect(s).toMatchObject({
      asOf: "2026-10-24",
      clearedCount: 3,
      clearedTotal: 5300,
      pendingCount: 2,
      pendingTotal: 4000,
      returnedCount: 1,
      returnedTotal: 2500,
    });
    expect(s!.clearedByOwner.map((g) => [g.owner, g.total, g.lines.length])).toEqual([
      ["Owner LLC", 3500, 2],
      ["Unknown owner", 1800, 1],
    ]);
    expect(s!.clearedByOwner[0].lines[0]).not.toHaveProperty("owner");
  });

  it("flags pending payments in flight for more than 10 days as stale", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/status = 'cleared'/, []],
        [
          /status = 'pending'/,
          [
            line("old", 1, { date_posted: "2026-10-13" }), // 11 days
            line("edge", 1, { date_posted: "2026-10-14" }), // exactly 10 days — not stale
            line("new", 1, { date_posted: "2026-10-23" }),
            line("undated", 1, { date_posted: null }),
          ],
        ],
        [/status = 'returned'/, []],
      ]) as never
    );

    expect((await paymentSummaryAsOf("2026-10-24"))!.pendingStale).toBe(1);
  });

  it("queries as of the requested date, defaulting to today", async () => {
    queryRaw.mockResolvedValue([] as never);

    await paymentSummaryAsOf("not-a-date");

    for (const [sql] of queryRaw.mock.calls) {
      expect((sql as unknown as { values: unknown[] }).values).toContain("2026-10-24");
    }
  });

  it("returns zeros (not null) for an empty table", async () => {
    queryRaw.mockResolvedValue([] as never);
    expect(await paymentSummaryAsOf()).toMatchObject({ clearedCount: 0, pendingTotal: 0, clearedByOwner: [] });
  });

  it("returns null when the payments table is missing", async () => {
    queryRaw.mockRejectedValue(new Error('relation "payments" does not exist'));
    expect(await paymentSummaryAsOf()).toBeNull();
  });
  it("marks owner contributions (rvown_ rows) so the pane can label them", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [
          /status = 'cleared'/,
          [{ ...line("rvown_11347", 2950, { clear_date: "2026-10-24", tenant: "Christian Chike" }), owner: "Christian Chike" }],
        ],
        [/status = 'pending'/, [line("rvpay_11337", 800), line("rvown_11400", 500)]],
        [/status = 'returned'/, []],
      ]) as never
    );

    const s = await paymentSummaryAsOf("2026-10-24");

    expect(s!.clearedByOwner[0].lines[0]).toMatchObject({ source_id: "rvown_11347", kind: "owner" });
    expect(s!.pending.map((p) => [p.source_id, p.kind])).toEqual([
      ["rvpay_11337", "rent"],
      ["rvown_11400", "owner"],
    ]);
  });
  describe("look-back range", () => {
    const valuesOf = (pattern: RegExp) => {
      const call = queryRaw.mock.calls.find(([q]) => pattern.test(sqlOf(q)));
      return (call![0] as unknown as { values: unknown[] }).values;
    };

    it("defaults to the 'today' view: cleared today or yesterday, returns within 5 days", async () => {
      queryRaw.mockResolvedValue([] as never);

      const s = await paymentSummaryAsOf("2026-10-24");

      expect(s!.rangeDays).toBe(1);
      expect(valuesOf(/status = 'cleared'/)).toEqual(["2026-10-24", "2026-10-24", 1]);
      expect(valuesOf(/status = 'returned'/)).toEqual(["2026-10-24", "2026-10-24", 5]);
    });

    it("with 7 days, covers the 7 days ending on the date for cleared and returns", async () => {
      queryRaw.mockResolvedValue([] as never);

      const s = await paymentSummaryAsOf("2026-10-24", 7);

      expect(s!.rangeDays).toBe(7);
      expect(valuesOf(/status = 'cleared'/)).toEqual(["2026-10-24", "2026-10-24", 6]); // Oct 18–24
      expect(valuesOf(/status = 'returned'/)).toEqual(["2026-10-24", "2026-10-24", 6]);
    });

    it("treats any other range as the default", async () => {
      queryRaw.mockResolvedValue([] as never);
      expect((await paymentSummaryAsOf("2026-10-24", 30))!.rangeDays).toBe(1);
    });
  });
});
