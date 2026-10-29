import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Server-only read layer for the Accounting → Transactions tab. Reads the
// plaid_transactions mirror that scripts/sync-plaid.ts fills (see
// prisma/sql/plaid.sql). Degrades to an empty result if the table isn't there
// yet (before the SQL is applied / the first sync), so the page can show its
// connect/empty state instead of erroring.

export type TxnRow = {
  transactionId: string;
  postedDate: string | null;
  accountName: string;
  merchantName: string;
  name: string;
  amount: number;
  category: string;
  pending: boolean;
};

export type TransactionsResult = {
  rows: TxnRow[];
  accounts: string[]; // distinct account names present, for a filter later
  linkedCount: number; // how many accounts are linked (plaid_items)
};

type RawTxn = {
  transaction_id: string;
  posted_date: Date | null;
  account_name: string | null;
  merchant_name: string | null;
  name: string | null;
  amount: Prisma.Decimal | number | null;
  category: string | null;
  pending: boolean | null;
};

function money(v: Prisma.Decimal | number | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function fetchPlaidTransactions(limit = 200): Promise<TransactionsResult> {
  try {
    const rows = await prisma.$queryRaw<RawTxn[]>(Prisma.sql`
      SELECT transaction_id, posted_date, account_name, merchant_name, name, amount, category, pending
      FROM plaid_transactions
      ORDER BY posted_date DESC NULLS LAST, synced_at DESC
      LIMIT ${limit}`);

    let linkedCount = 0;
    try {
      const c = await prisma.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS n FROM plaid_items WHERE status = 'active'`
      );
      linkedCount = c[0]?.n ?? 0;
    } catch {
      /* plaid_items not created yet */
    }

    const mapped: TxnRow[] = rows.map((r) => ({
      transactionId: r.transaction_id,
      postedDate: isoDate(r.posted_date),
      accountName: r.account_name ?? "",
      merchantName: r.merchant_name || r.name || "",
      name: r.name ?? "",
      amount: money(r.amount),
      category: r.category ?? "",
      pending: !!r.pending,
    }));

    const accounts = [...new Set(mapped.map((r) => r.accountName).filter(Boolean))].sort();
    return { rows: mapped, accounts, linkedCount };
  } catch {
    // Table not created yet (SQL not applied / first sync not run) — show empty.
    return { rows: [], accounts: [], linkedCount: 0 };
  }
}
