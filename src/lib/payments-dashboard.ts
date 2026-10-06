import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Dashboard aggregates for the Payments pane, read from the Neon `payments`
// table that the settlement sync populates (see prisma/sql/payments.sql).
// Server-only. Returns null if the table isn't there yet, so the dashboard
// simply hides the pane instead of erroring.

export type PaymentSummary = {
  pendingCount: number;
  pendingTotal: number;
  pendingStale: number; // pending longer than ~10 days — worth chasing
  clearedCount: number;
  clearedTotal: number;
  returnedCount: number;
  returnedTotal: number;
};

export type PendingPayment = {
  source_id: string;
  tenant: string | null;
  property_address: string | null;
  amount: number;
  date_posted: Date | null;
};

const CLEARED_WINDOW_DAYS = 7; // "recently became available"
const RETURNED_WINDOW_DAYS = 14;
const STALE_DAYS = 10;

export async function loadPaymentSummary(): Promise<{
  summary: PaymentSummary;
  pending: PendingPayment[];
} | null> {
  try {
    const rows = await prisma.$queryRaw<PaymentSummary[]>(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE status = 'pending')::int AS "pendingCount",
        COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::float8 AS "pendingTotal",
        count(*) FILTER (WHERE status = 'pending'
          AND date_posted < current_date - ${STALE_DAYS})::int AS "pendingStale",
        count(*) FILTER (WHERE status = 'cleared'
          AND clear_date >= current_date - ${CLEARED_WINDOW_DAYS})::int AS "clearedCount",
        COALESCE(sum(amount) FILTER (WHERE status = 'cleared'
          AND clear_date >= current_date - ${CLEARED_WINDOW_DAYS}), 0)::float8 AS "clearedTotal",
        count(*) FILTER (WHERE status = 'returned'
          AND date_posted >= current_date - ${RETURNED_WINDOW_DAYS})::int AS "returnedCount",
        COALESCE(sum(amount) FILTER (WHERE status = 'returned'
          AND date_posted >= current_date - ${RETURNED_WINDOW_DAYS}), 0)::float8 AS "returnedTotal"
      FROM payments`);

    const summary = rows[0];
    if (!summary) return null;

    // The open payments to watch: oldest pending first.
    const pending = await prisma.$queryRaw<PendingPayment[]>(Prisma.sql`
      SELECT source_id, tenant, property_address, amount::float8 AS amount, date_posted
      FROM payments
      WHERE status = 'pending'
      ORDER BY date_posted ASC NULLS LAST
      LIMIT 8`);

    return { summary, pending };
  } catch {
    // Table not created yet (or DB hiccup) — hide the pane rather than crash
    // the whole dashboard.
    return null;
  }
}

export const PAYMENTS_WINDOWS = { CLEARED_WINDOW_DAYS, RETURNED_WINDOW_DAYS, STALE_DAYS };
