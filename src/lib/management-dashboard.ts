import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import { listWorkOrders } from "@/lib/work-orders-dashboard";
import {
  archivedByWeek,
  backlogByStage,
  collectionsHeadline,
  countByWeek,
  medianDaysToFill,
  occupancy,
  openedClosedByWeek,
  preventiveSplit,
  recentWeekStarts,
  rentCollectedByWeek,
  returnsByWeek,
  workOrderHeadline,
  type ArchivePoint,
  type CollectionsHeadline,
  type CountWeekPoint,
  type LeaseTerm,
  type MoneyWeekPoint,
  type Occupancy,
  type PaymentRow,
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
  // Not in Rentvine AND still needs to be: not-reimbursable rows never go to
  // Rentvine (see archive-rules.ts), so they're excluded.
  notInRentvine: number;
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
  collections: {
    headline: CollectionsHeadline;
    collectedByWeek: MoneyWeekPoint[];
    returnsByWeek: CountWeekPoint[];
  };
  leasing: {
    occupancy: Occupancy;
    activeLeases: number;
    medianDaysToFill: number | null;
    inspectionsByWeek: CountWeekPoint[];
    inspectionsThisWeek: number;
    showingsByWeek: CountWeekPoint[];
  };
};

const EMPTY_RECORDED: RecordedProgress = { total: 0, both: 0, qbOnly: 0, rvOnly: 0, neither: 0, notInRentvine: 0 };

type RecRow = { total: number; both: number; qb_only: number; rv_only: number; neither: number; not_in_rv: number };

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
          COUNT(*) FILTER (WHERE NOT recorded_quickbooks AND NOT recorded_rentvine)::int AS neither,
          COUNT(*) FILTER (WHERE NOT recorded_rentvine AND reimbursable IS DISTINCT FROM 'no')::int AS not_in_rv
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
        ? { total: r.total, both: r.both, qbOnly: r.qb_only, rvOnly: r.rv_only, neither: r.neither, notInRentvine: r.not_in_rv }
        : EMPTY_RECORDED,
    };
  } catch {
    return empty; // plaid_transactions not present / not reachable
  }
}

async function fetchCollections(
  weeks: number,
  now: Date
): Promise<{ headline: CollectionsHeadline; collectedByWeek: MoneyWeekPoint[]; returnsByWeek: CountWeekPoint[] }> {
  const empty = {
    headline: collectionsHeadline([], now),
    collectedByWeek: rentCollectedByWeek([], weeks, now),
    returnsByWeek: returnsByWeek([], weeks, now),
  };
  try {
    const firstWeek = recentWeekStarts(now, weeks)[0];
    // Tenant rent payments (rvpay_*). Window the charts, but keep all pending so
    // the in-flight headline is complete.
    const rows = await prisma.$queryRaw<{ date_posted: Date | string | null; amount: Prisma.Decimal | number | string; status: string }[]>(
      Prisma.sql`SELECT date_posted, amount, status FROM payments
                 WHERE source_id LIKE 'rvpay_%' AND (date_posted >= ${firstWeek}::date OR status = 'pending')`
    );
    const payments: PaymentRow[] = rows.map((r) => ({
      datePosted:
        r.date_posted == null ? null : r.date_posted instanceof Date ? r.date_posted.toISOString().slice(0, 10) : String(r.date_posted).slice(0, 10),
      amount: Number(r.amount) || 0,
      status: r.status,
    }));
    return {
      headline: collectionsHeadline(payments, now),
      collectedByWeek: rentCollectedByWeek(payments, weeks, now),
      returnsByWeek: returnsByWeek(payments, weeks, now),
    };
  } catch {
    return empty; // payments table not present / not reachable
  }
}

type LeasingData = ManagementKpis["leasing"];

async function fetchLeasing(weeks: number, now: Date): Promise<LeasingData> {
  const empty: LeasingData = {
    occupancy: occupancy([]),
    activeLeases: 0,
    medianDaysToFill: null,
    inspectionsByWeek: countByWeek([], weeks, now),
    inspectionsThisWeek: 0,
    showingsByWeek: countByWeek([], weeks, now),
  };
  try {
    const cutoff = new Date(recentWeekStarts(now, weeks)[0] + "T00:00:00Z");
    const [units, activeLeases, leaseRows, inspections, showings] = await Promise.all([
      prisma.unit.findMany({ select: { status: true } }),
      prisma.lease.count({ where: { status: "active" } }),
      prisma.lease.findMany({ select: { unitId: true, startDate: true, endDate: true } }),
      prisma.inspection.findMany({ where: { completedAt: { gte: cutoff } }, select: { completedAt: true } }),
      prisma.showing.findMany({ where: { startTime: { gte: cutoff } }, select: { startTime: true } }),
    ]);
    const terms: LeaseTerm[] = leaseRows.map((l) => ({
      unitId: l.unitId,
      startDate: l.startDate ? l.startDate.toISOString() : null,
      endDate: l.endDate ? l.endDate.toISOString() : null,
    }));
    const inspectionsByWeek = countByWeek(inspections.map((i) => i.completedAt?.toISOString() ?? null), weeks, now);
    return {
      occupancy: occupancy(units.map((u) => u.status)),
      activeLeases,
      medianDaysToFill: medianDaysToFill(terms, 180, now),
      inspectionsByWeek,
      inspectionsThisWeek: inspectionsByWeek.length ? inspectionsByWeek[inspectionsByWeek.length - 1].count : 0,
      showingsByWeek: countByWeek(showings.map((s) => s.startTime?.toISOString() ?? null), weeks, now),
    };
  } catch {
    return empty; // leasing tables not present / not reachable
  }
}

export async function loadManagementKpis(weeks = 12, now: Date = new Date()): Promise<ManagementKpis> {
  const [wos, accounting, collections, leasing] = await Promise.all([
    listWorkOrders(),
    fetchAccounting(weeks, now),
    fetchCollections(weeks, now),
    fetchLeasing(weeks, now),
  ]);
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
    collections,
    leasing,
  };
}
