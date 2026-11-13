import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildBillIndex, candidatesFor, type RvBillLine, type RvCandidate } from "@/lib/rv-bill-match";

// Server-only: attaches each bank transaction's Rentvine bill-line candidates
// (same amount, near the date) from rv_bill_charges, which
// scripts/sync-rentvine-bills.ts fills. The table component classifies them
// by the transaction's tagged property (src/lib/rv-bill-match.ts). If the table
// isn't there yet (bill sync never ran), rows get no candidates and the column
// shows "—" instead of a misleading "Not billed". Archived charges and ones
// before BILL_CHECK_FROM aren't checked either.

type RawLine = {
  transaction_id: string;
  bill_id: string;
  property_external_id: string | null;
  amount: Prisma.Decimal | number | string;
  date_posted: Date | string;
  description: string | null;
  payee: string | null;
  reference: string | null;
};

// The team switched to the app for transactions from 9/29/2026; everything
// before was handled the old way and archived. Only charges from then on that
// are still open (not archived) get checked.
export const BILL_CHECK_FROM = "2026-09-29";

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function attachBillCandidates<
  T extends { amount: number; postedDate: string | null; archived?: boolean }
>(
  rows: T[]
): Promise<(T & { rvCandidates?: RvCandidate[] })[]> {
  let raw: RawLine[];
  try {
    raw = await prisma.$queryRaw<RawLine[]>(Prisma.sql`
      SELECT transaction_id, bill_id, property_external_id, amount, date_posted, description, payee, reference
      FROM rv_bill_charges`);
  } catch {
    return rows;
  }
  const lines: RvBillLine[] = raw.map((r) => ({
    transactionId: r.transaction_id,
    billId: r.bill_id,
    propertyRvId: r.property_external_id ?? "",
    amount: Number(r.amount),
    date: iso(r.date_posted),
    description: r.description ?? "",
    payee: r.payee ?? "",
    reference: r.reference ?? "",
  }));
  const idx = buildBillIndex(lines);
  return rows.map((r) =>
    r.archived || !r.postedDate || r.postedDate < BILL_CHECK_FROM ? r : { ...r, rvCandidates: candidatesFor(r, idx) }
  );
}

// Base for a bill link; the bill id is appended.
export function rentvineBillUrl(): string {
  const explicit = (process.env.RENTVINE_BASE_URL || "").trim();
  const host = explicit ? explicit.replace(/^https?:\/\//, "").split("/")[0] : "";
  const sub = process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${host || `${sub}.rentvine.com`}/accounting/payables/bills/`;
}
