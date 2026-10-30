import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { formatCurrency } from "@/lib/format";
import { isPlaidConfigured } from "@/lib/plaid";
import { fetchPlaidTransactions } from "@/lib/plaid-db";
import { AccountingTabs } from "../AccountingTabs";
import { ConnectButton } from "./ConnectButton";

// Card/bank transactions (Amex, Home Depot, …) pulled from Plaid by the daily
// sync (scripts/sync-plaid.ts) into plaid_transactions.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TransactionsPage() {
  requireFeature("accounting");
  if (!canAccessAccounting(await getCurrentUser())) notFound();
  const configured = isPlaidConfigured();
  const { rows, linkedCount } = configured
    ? await fetchPlaidTransactions()
    : { rows: [], linkedCount: 0 };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-lg font-semibold text-ink">Accounting</h1>
      <AccountingTabs />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Card &amp; bank transactions from your connected accounts, refreshed daily.
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
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Merchant</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.transactionId} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.postedDate || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.accountName || "—"}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {r.merchantName || "—"}
                    {r.pending && <span className="ml-1 text-xs text-amber-600">(pending)</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                    {r.category ? r.category.replaceAll("_", " ").toLowerCase() : ""}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                      r.amount < 0 ? "text-emerald-700" : "text-slate-800"
                    }`}
                  >
                    {formatCurrency(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
