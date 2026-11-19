import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(), $executeRawUnsafe: vi.fn(async () => 0) } }));

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
  return_date: null,
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
          /WHERE status = 'cleared'/,
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
        [/WHERE status = 'cleared'/, []],
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
          /WHERE status = 'cleared'/,
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
      expect(valuesOf(/WHERE status = 'cleared'/)).toEqual(["2026-10-24", "2026-10-24", 1]);
      expect(valuesOf(/WHERE status = 'returned'/)).toEqual(["2026-10-24", "2026-10-24", 5]);
    });

    it("with 7 days, covers the 7 days ending on the date for cleared and returns", async () => {
      queryRaw.mockResolvedValue([] as never);

      const s = await paymentSummaryAsOf("2026-10-24", 7);

      expect(s!.rangeDays).toBe(7);
      expect(valuesOf(/WHERE status = 'cleared'/)).toEqual(["2026-10-24", "2026-10-24", 6]); // Oct 18–24
      expect(valuesOf(/WHERE status = 'returned'/)).toEqual(["2026-10-24", "2026-10-24", 6]);
    });

    it("treats any other range as the default", async () => {
      queryRaw.mockResolvedValue([] as never);
      expect((await paymentSummaryAsOf("2026-10-24", 30))!.rangeDays).toBe(1);
    });
  });

  it("counts a payment as in flight on a past date even if it has cleared since (Walker: posted 11/13, settled 11/18)", async () => {
    let pendingSql = "";
    let pendingValues: unknown[] = [];
    queryRaw.mockImplementation((async (q: unknown) => {
      const text = sqlOf(q);
      if (/in flight as of/.test(text) || /status = 'pending'/.test(text)) {
        pendingSql = text;
        pendingValues = (q as { values: unknown[] }).values;
      }
      return routeQueries([
        [/WHERE status = 'cleared'/, []],
        [/status = 'pending'/, [line("rvpay_11917", 5000, { date_posted: "2026-11-13", clear_date: "2026-11-18" })]],
        [/status = 'returned'/, []],
      ])(q);
    }) as never);

    const s = await paymentSummaryAsOf("2026-11-17");

    // Still pending today, OR cleared after the view date: both were in flight then.
    expect(pendingSql).toMatch(/date_posted <= \?::date AND \(status = 'pending' OR \(status = 'cleared' AND clear_date > \?::date\)/);
    expect(pendingValues).toEqual(["2026-11-17", "2026-11-17", "2026-11-17"]);
    expect(s).toMatchObject({ pendingCount: 1, pendingTotal: 5000 });
  });

  describe("returns use the date they were returned (Walker: $2,500 posted 11/7, returned 11/13)", () => {
    const capture = () => {
      const seen: Record<string, { sql: string; values: unknown[] }> = {};
      queryRaw.mockImplementation((async (q: unknown) => {
        const sql = sqlOf(q);
        const key = /WHERE status = 'cleared'/.test(sql) ? "cleared" : /WHERE status = 'returned'/.test(sql) ? "returned" : "pending";
        seen[key] = { sql, values: (q as { values: unknown[] }).values };
        return [];
      }) as never);
      return seen;
    };

    it("counts a payment returned after the view date as in flight on that date", async () => {
      const seen = capture();
      await paymentSummaryAsOf("2026-11-10");
      expect(seen.pending.sql).toMatch(/OR \(status = 'returned' AND return_date > \?::date\)/);
      expect(seen.pending.values).toEqual(["2026-11-10", "2026-11-10", "2026-11-10"]);
    });

    it("lists returns by return date, falling back to the paid date when it isn't synced", async () => {
      const seen = capture();
      await paymentSummaryAsOf("2026-11-13");
      expect(seen.returned.sql).toMatch(/COALESCE\(return_date, date_posted\) <= \?::date AND COALESCE\(return_date, date_posted\) >= \?::date - \?::int/);
      expect(seen.returned.sql).toMatch(/ORDER BY COALESCE\(return_date, date_posted\) DESC/);
    });

    it("selects return_date for each line", async () => {
      const seen = capture();
      await paymentSummaryAsOf("2026-11-13");
      for (const k of ["cleared", "pending", "returned"]) expect(seen[k].sql).toMatch(/to_char\(return_date, 'YYYY-MM-DD'\) AS return_date/);
    });

    it("makes sure the sync-owned return_date column exists before querying (once per process)", async () => {
      vi.resetModules(); // the guard is cached per module instance
      const { prisma: fresh } = await import("@/lib/prisma");
      const { paymentSummaryAsOf: load } = await import("@/lib/payments-dashboard");
      vi.mocked(fresh.$queryRaw).mockResolvedValue([] as never);
      const ddl = vi.mocked(fresh.$executeRawUnsafe);
      ddl.mockClear();
      await load("2026-11-13");
      await load("2026-11-14");
      expect(ddl).toHaveBeenCalledTimes(1);
      expect(ddl).toHaveBeenCalledWith("ALTER TABLE payments ADD COLUMN IF NOT EXISTS return_date DATE");
    });
  });
});
