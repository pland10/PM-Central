import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Dashboard data for Payments / rent settlements, read from the Neon `payments`
// table that settlement_sync.py populates (see prisma/sql/payments.sql).
// Server-only. Returns null if the table isn't there yet, so the dashboard
// hides the pane instead of erroring.
//
// Mirrors the settlement email's categories so the UI shows the same picture:
//   - Cleared (now payable): status=cleared, clear_date within the last 1 day
//     as of the view date — grouped by owner so it's clear who can be paid.
//   - Pending (in flight):   status=pending, posted on/before the view date.
//   - Returns / NSF (5d):    status=returned, posted within the last 5 days.
// A pending payment older than STALE_DAYS is almost certainly stuck, not in
// flight, so it's flagged.

export type PaymentLine = {
  source_id: string;
  tenant: string | null;
  property_address: string | null;
  amount: number;
  date_posted: string | null; // YYYY-MM-DD
  clear_date: string | null; // YYYY-MM-DD (cleared only)
  expected_clear: string | null; // YYYY-MM-DD (pending estimate)
};

export type OwnerGroup = {
  owner: string;
  total: number;
  lines: PaymentLine[];
};

export type PaymentAsOf = {
  asOf: string; // YYYY-MM-DD
  clearedCount: number;
  clearedTotal: number;
  clearedByOwner: OwnerGroup[]; // cleared "now payable", grouped by owner
  pendingCount: number;
  pendingTotal: number;
  pendingStale: number; // pending in flight > STALE_DAYS as of asOf
  pending: PaymentLine[]; // in-flight as of asOf, oldest first
  returnedCount: number;
  returnedTotal: number;
  returned: PaymentLine[]; // returned / NSF within 5 days, newest first
};

const STALE_DAYS = 10;
const CLEARED_WINDOW_DAYS = 1; // "now payable" = cleared today or yesterday
const RETURNS_WINDOW_DAYS = 5;
export const PAYMENTS_WINDOWS = { STALE_DAYS, CLEARED_WINDOW_DAYS, RETURNS_WINDOW_DAYS };

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(s: string | undefined | null): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayStr();
}

const LINE_COLS = Prisma.sql`
  source_id, tenant, property_address, amount::float8 AS amount,
  to_char(date_posted, 'YYYY-MM-DD') AS date_posted,
  to_char(clear_date, 'YYYY-MM-DD') AS clear_date,
  to_char(expected_clear, 'YYYY-MM-DD') AS expected_clear`;

export async function paymentSummaryAsOf(asOfRaw?: string): Promise<PaymentAsOf | null> {
  const asOf = normalizeDate(asOfRaw);
  try {
    // Cleared "now payable": cleared within the window ending on asOf.
    const clearedRows = await prisma.$queryRaw<(PaymentLine & { owner: string | null })[]>(Prisma.sql`
      SELECT ${LINE_COLS}, owner
      FROM payments
      WHERE status = 'cleared'
        AND clear_date <= ${asOf}::date
        AND clear_date >= ${asOf}::date - ${CLEARED_WINDOW_DAYS}::int
      ORDER BY owner ASC NULLS LAST, clear_date ASC, amount DESC`);

    // Pending (in flight) as of asOf, oldest first.
    const pending = await prisma.$queryRaw<PaymentLine[]>(Prisma.sql`
      SELECT ${LINE_COLS}
      FROM payments
      WHERE status = 'pending' AND date_posted <= ${asOf}::date
      ORDER BY date_posted ASC NULLS LAST`);

    // Returns / NSF within the last RETURNS_WINDOW_DAYS, newest first.
    const returned = await prisma.$queryRaw<PaymentLine[]>(Prisma.sql`
      SELECT ${LINE_COLS}
      FROM payments
      WHERE status = 'returned'
        AND date_posted <= ${asOf}::date
        AND date_posted >= ${asOf}::date - ${RETURNS_WINDOW_DAYS}::int
      ORDER BY date_posted DESC NULLS LAST`);

    // If every query is empty the table may simply be unpopulated — but it still
    // exists, so return zeros (the pane shows an empty state, not hidden).
    const clearedTotal = clearedRows.reduce((s, r) => s + r.amount, 0);
    const pendingTotal = pending.reduce((s, r) => s + r.amount, 0);
    const returnedTotal = returned.reduce((s, r) => s + r.amount, 0);

    const asOfMs = Date.parse(asOf);
    const pendingStale = pending.filter((p) => {
      if (!p.date_posted) return false;
      const age = Math.round((asOfMs - Date.parse(p.date_posted)) / 86_400_000);
      return age > STALE_DAYS;
    }).length;

    // Group cleared by owner, preserving the owner/clear_date ordering above.
    const groups = new Map<string, OwnerGroup>();
    for (const r of clearedRows) {
      const owner = r.owner || "Unknown owner";
      let g = groups.get(owner);
      if (!g) {
        g = { owner, total: 0, lines: [] };
        groups.set(owner, g);
      }
      g.total += r.amount;
      g.lines.push({
        source_id: r.source_id,
        tenant: r.tenant,
        property_address: r.property_address,
        amount: r.amount,
        date_posted: r.date_posted,
        clear_date: r.clear_date,
        expected_clear: r.expected_clear,
      });
    }

    return {
      asOf,
      clearedCount: clearedRows.length,
      clearedTotal,
      clearedByOwner: [...groups.values()],
      pendingCount: pending.length,
      pendingTotal,
      pendingStale,
      pending,
      returnedCount: returned.length,
      returnedTotal,
      returned,
    };
  } catch {
    return null;
  }
}
