import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    unit: { findMany: vi.fn() },
    lease: { count: vi.fn(), findMany: vi.fn() },
    inspection: { findMany: vi.fn() },
    showing: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/plaid-sync", () => ({ ensurePlaidAnnotationColumns: vi.fn() }));
vi.mock("@/lib/work-orders-dashboard", () => ({ listWorkOrders: vi.fn(async () => []) }));

import { prisma } from "@/lib/prisma";
import { loadManagementKpis } from "@/lib/management-dashboard";

const queryRaw = vi.mocked(prisma.$queryRaw);
const NOW = new Date("2026-11-13T12:00:00Z");

beforeEach(() => {
  vi.mocked(prisma.unit.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.lease.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.lease.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.inspection.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.showing.findMany).mockResolvedValue([] as never);
});

describe("loadManagementKpis — accounting 'Not in Rentvine'", () => {
  it("counts only rows that still need Rentvine (not-reimbursable rows never go there)", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/SELECT archived_at FROM plaid_transactions/, []],
        [
          /FROM plaid_transactions WHERE archived = false/,
          [{ total: 10, both: 4, qb_only: 3, rv_only: 1, neither: 2, not_in_rv: 2 }],
        ],
        [/FROM payments/, []],
      ]) as never
    );

    const kpis = await loadManagementKpis(12, NOW);

    // 5 rows lack Rentvine (3 QB-only + 2 neither), but only 2 are reimbursable.
    expect(kpis.accounting.recorded.notInRentvine).toBe(2);
  });

  it("excludes reimbursable = 'no' in the SQL count (null/unset still counts)", async () => {
    let recordedSql = "";
    queryRaw.mockImplementation((async (q: unknown) => {
      const text = (q as { sql: string }).sql.replace(/\s+/g, " ");
      if (/WHERE archived = false/.test(text)) recordedSql = text;
      return routeQueries([
        [/SELECT archived_at/, []],
        [/WHERE archived = false/, [{ total: 0, both: 0, qb_only: 0, rv_only: 0, neither: 0, not_in_rv: 0 }]],
        [/FROM payments/, []],
      ])(q);
    }) as never);

    await loadManagementKpis(12, NOW);

    expect(recordedSql).toMatch(/NOT recorded_rentvine AND reimbursable IS DISTINCT FROM 'no'/);
  });
});
