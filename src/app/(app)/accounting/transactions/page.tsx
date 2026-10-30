import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { isPlaidConfigured } from "@/lib/plaid";
import { fetchPlaidTransactions } from "@/lib/plaid-db";
import { AccountingTabs } from "../AccountingTabs";
import { ConnectButton } from "./ConnectButton";
import { TransactionsTable } from "./TransactionsTable";

// Card/bank transactions (Amex, Home Depot, …) pulled from Plaid by the daily
// sync (scripts/sync-plaid.ts) into plaid_transactions. The table itself
// (summary bar, sort/filter, inline-editable annotation columns) is the client
// component TransactionsTable; this server component just loads the rows.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TransactionsPage() {
  requireFeature("accounting");
  if (!canAccessAccounting(await getCurrentUser())) notFound();
  const configured = isPlaidConfigured();
  const { rows, accounts, linkedCount } = configured
    ? await fetchPlaidTransactions()
    : { rows: [], accounts: [], linkedCount: 0 };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-lg font-semibold text-ink">Accounting</h1>
      <AccountingTabs />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Card &amp; bank transactions from your connected accounts, refreshed daily. Mark each one
          reimbursable, set your own category, and tick it off as it&apos;s recorded.
        </p>
        <ConnectButton disabled={!configured} />
      </div>

      {!configured ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Plaid isn&apos;t configured for this environment yet. Set <code>PLAID_CLIENT_ID</code>,{" "}
          <code>PLAID_SECRET</code>, and <code>PLAID_ENV</code> on the service to enable connecting
          accounts.
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            {linkedCount > 0
              ? "No transactions yet — the next daily sync will pull them in."
              : "No accounts connected yet."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Use “Connect account” to link a card or bank through Plaid.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <TransactionsTable initialRows={rows} accounts={accounts} />
        </div>
      )}
    </div>
  );
}
