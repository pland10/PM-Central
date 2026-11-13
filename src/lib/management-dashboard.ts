import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import { listWorkOrders } from "@/lib/work-orders-dashboard";
import {
  archivedByWeek,
  backlogByStage,
  openedClosedByWeek,
  preventiveSplit,
  recentWeekStarts,
  workOrderHeadline,
  type ArchivePoint,
  type StageCount,
  type WeekPoint,
  type WorkOrderHeadline,
} from "@/lib/management-kpis";

// Server loader for the Management Dashboard (/management). Pulls the raw data
// and runs the pure KPI helpers (management-kpis.ts). Each source degrades to
// empty on error so one missing table never takes the whole page down.

export type RecordedProgress = {
  total: number; // active (not archived, not pending)
  both: number; // recorded in QuickBooks AND Rentvine
  qbOnly: number;
  rvOnly: number;
  neither: number;
};

export type ManagementKpis = {
  weeks: number;
  generatedAt: string;
  workOrders: {
    headline: WorkOrderHeadline;
    openedClosed: WeekPoint[];
    backlog: StageCount[];
    preventive: { preventive: number; reactive: number };
  };
  accounting: {
    archivedByWeek: ArchivePoint[];
    archivedThisWeek: number;
    recorded: RecordedProgress;
  };
};

const EMPTY_RECORDED: RecordedProgress = { total: 0, both: 0, qbOnly: 0, rvOnly: 0, neither: 0 };

type RecRow = { total: number; both: number; qb_only: number; rv_only: number; neither: number };

async function fetchAccounting(
  weeks: number,
  now: Date
): Promise<{ archivedByWeek: ArchivePoint[]; archivedThisWeek: number; recorded: RecordedProgress }> {
  const empty = { archivedByWeek: archivedByWeek([], weeks, now), archivedThisWeek: 0, recorded: EMPTY_RECORDED };
  try {
    await ensurePlaidAnnotationColumns(prisma);
    const cutoff = new Date(recentWeekStarts(now, weeks)[0] + "T00:00:00Z");
    const [archivedRows, recRows] = await Promise.all([
      prisma.$queryRaw<{ archived_at: Date | null }[]>(Prisma.sql`
        SELECT archived_at FROM plaid_transactions
        WHERE archived = true AND archived_at IS NOT NULL AND archived_at >= ${cutoff}`),
      prisma.$queryRaw<RecRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE recorded_quickbooks AND recorded_rentvine)::int AS both,
          COUNT(*) FILTER (WHERE recorded_quickbooks AND NOT recorded_rentvine)::int AS qb_only,
          COUNT(*) FILTER (WHERE NOT recorded_quickbooks AND recorded_rentvine)::int AS rv_only,
          COUNT(*) FILTER (WHERE NOT recorded_quickbooks AND NOT recorded_rentvine)::int AS neither
        FROM plaid_transactions WHERE archived = false AND pending = false`),
    ]);
    const series = archivedByWeek(
      archivedRows.map((r) => (r.archived_at ? new Date(r.archived_at).toISOString() : null)),
      weeks,
      now
    );
    const r = recRows[0];
    return {
      archivedByWeek: series,
      archivedThisWeek: series.length ? series[series.length - 1].count : 0,
      recorded: r
        ? { total: r.total, both: r.both, qbOnly: r.qb_only, rvOnly: r.rv_only, neither: r.neither }
        : EMPTY_RECORDED,
    };
  } catch {
    return empty; // plaid_transactions not present / not reachable
  }
}

export async function loadManagementKpis(weeks = 12, now: Date = new Date()): Promise<ManagementKpis> {
  const [wos, accounting] = await Promise.all([listWorkOrders(), fetchAccounting(weeks, now)]);
  const orders = wos ?? [];
  return {
    weeks,
    generatedAt: now.toISOString(),
    workOrders: {
      headline: workOrderHeadline(orders, now),
      openedClosed: openedClosedByWeek(orders, weeks, now),
      backlog: backlogByStage(orders),
      preventive: preventiveSplit(orders),
    },
    accounting,
  };
}
