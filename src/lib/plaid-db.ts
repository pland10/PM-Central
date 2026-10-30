import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlaidAnnotationColumns } from "@/lib/plaid-sync";
import type { Reimbursable } from "@/lib/transactions-view";

// Server-only read layer for the Accounting → Transactions tab. Reads the
// plaid_transactions mirror that scripts/sync-plaid.ts fills (see
// prisma/sql/plaid.sql), including the hand-entered annotation columns
// (reimbursable?, category override, recorded-in-QuickBooks/Rentvine, notes).
// Degrades to an empty result if the table isn't there yet (before the SQL is
// applied / the first sync), so the page can show its connect/empty state
// instead of erroring.

export type TxnRow = {
  transactionId: string;
  postedDate: string | null;
  accountName: string;
  merchantName: string;
  name: string;
  amount: number;
  category: string;
  pending: boolean;
  // Hand-entered (editable on the page):
  reimbursable: Reimbursable;
  categoryOverride: string;
  recordedQuickbooks: boolean;
  recordedRentvine: boolean;
  notes: string;
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
  reimbursable: string | null;
  category_override: string | null;
  recorded_quickbooks: boolean | null;
  recorded_rentvine: boolean | null;
  notes: string | null;
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
    // Make sure the annotation columns exist before selecting them (self-heals
    // on a DB where the additive SQL hasn't been applied yet).
    await ensurePlaidAnnotationColumns(prisma);
    const rows = await prisma.$queryRaw<RawTxn[]>(Prisma.sql`
      SELECT transaction_id, posted_date, account_name, merchant_name, name, amount, category, pending,
             reimbursable, category_override, recorded_quickbooks, recorded_rentvine, notes
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
      reimbursable: r.reimbursable === "yes" ? "yes" : r.reimbursable === "no" ? "no" : null,
      categoryOverride: r.category_override ?? "",
      recordedQuickbooks: !!r.recorded_quickbooks,
      recordedRentvine: !!r.recorded_rentvine,
      notes: r.notes ?? "",
    }));

    const accounts = [...new Set(mapped.map((r) => r.accountName).filter(Boolean))].sort();
    return { rows: mapped, accounts, linkedCount };
  } catch {
    // Table not created yet (SQL not applied / first sync not run) — show empty.
    return { rows: [], accounts: [], linkedCount: 0 };
  }
}
