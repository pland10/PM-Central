import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Dashboard data for Payments, read from the Neon `payments` table that the
// settlement sync populates (see prisma/sql/payments.sql). Server-only. Returns
// null if the table isn't there yet, so the dashboard hides the pane instead of
// erroring.
//
// Everything is computed "as of" a date, so the panel can step back through
// prior days:
//   - pending as of D  = posted on/before D and not settled by D (a currently
//     cleared payment whose clear_date is after D was still in flight on D).
//   - cleared on D      = clear_date is exactly D.

export type PendingPayment = {
  source_id: string;
  tenant: string | null;
  property_address: string | null;
  amount: number;
  date_posted: string | null; // YYYY-MM-DD
};

export type PaymentAsOf = {
  asOf: string; // YYYY-MM-DD
  pendingCount: number;
  pendingTotal: number;
  pendingStale: number; // of those pending, how many have been in flight > STALE_DAYS as of asOf
  clearedCount: number;
  clearedTotal: number;
  pending: PendingPayment[]; // in-flight as of asOf, oldest first
};

const STALE_DAYS = 10;
export const PAYMENTS_WINDOWS = { STALE_DAYS };

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(s: string | undefined | null): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayStr();
}

export async function paymentSummaryAsOf(asOfRaw?: string): Promise<PaymentAsOf | null> {
  const asOf = normalizeDate(asOfRaw);
  try {
    const rows = await prisma.$queryRaw<Omit<PaymentAsOf, "asOf" | "pending">[]>(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE date_posted <= ${asOf}::date
          AND (status = 'pending' OR (status = 'cleared' AND clear_date > ${asOf}::date)))::int AS "pendingCount",
        COALESCE(sum(amount) FILTER (WHERE date_posted <= ${asOf}::date
          AND (status = 'pending' OR (status = 'cleared' AND clear_date > ${asOf}::date))), 0)::float8 AS "pendingTotal",
        count(*) FILTER (WHERE date_posted <= ${asOf}::date - ${STALE_DAYS}::int
          AND (status = 'pending' OR (status = 'cleared' AND clear_date > ${asOf}::date)))::int AS "pendingStale",
        count(*) FILTER (WHERE status = 'cleared' AND clear_date = ${asOf}::date)::int AS "clearedCount",
        COALESCE(sum(amount) FILTER (WHERE status = 'cleared' AND clear_date = ${asOf}::date), 0)::float8 AS "clearedTotal"
      FROM payments`);

    const agg = rows[0];
    if (!agg) return null;

    const pending = await prisma.$queryRaw<PendingPayment[]>(Prisma.sql`
      SELECT source_id, tenant, property_address, amount::float8 AS amount,
             to_char(date_posted, 'YYYY-MM-DD') AS date_posted
      FROM payments
      WHERE date_posted <= ${asOf}::date
        AND (status = 'pending' OR (status = 'cleared' AND clear_date > ${asOf}::date))
      ORDER BY date_posted ASC NULLS LAST
      LIMIT 12`);

    return { asOf, ...agg, pending };
  } catch {
    return null;
  }
}
