import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { isPlaidConfigured } from "@/lib/plaid";
import { fetchPlaidTransactions } from "@/lib/plaid-db";
import { listHideRulesSafe } from "@/lib/transaction-filters-db";
import { listCategoryNamesSafe } from "@/lib/transaction-categories-db";
import { buildPropertyChoices, listPropertyOptions, type PropertyOption } from "@/lib/property-options";
import { listActiveUnits } from "@/lib/rentvine-units";
import { prisma } from "@/lib/prisma";
import { patternToLike } from "@/lib/transaction-filters";
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
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) notFound();
  const configured = isPlaidConfigured();
  // Admin hide filters (Admin → Transaction filters), e.g. *CSG FORTE*.
  const hideLikes = configured ? (await listHideRulesSafe()).map((r) => patternToLike(r.pattern)) : [];
  const [{ rows, accounts, linkedCount, capped, hiddenCount }, categories, properties, units] = configured
    ? await Promise.all([
        fetchPlaidTransactions(2000, hideLikes),
        listCategoryNamesSafe(),
        listPropertyOptions().catch((): PropertyOption[] => []),
        listActiveUnits(prisma),
      ])
    : [{ rows: [], accounts: [], linkedCount: 0, capped: false, hiddenCount: 0 }, [], [], []];
  // Properties, plus each unit of a multi-unit property, for the picker.
  const propertyChoices = buildPropertyChoices(properties, units);

  return (
    <div>
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
      ) : rows.length === 0 && hiddenCount === 0 ? (
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
          <TransactionsTable
            initialRows={rows}
            accounts={accounts}
            capped={capped}
            hiddenCount={hiddenCount}
            canManageFilters={user?.role === "admin"}
            categories={categories}
            properties={propertyChoices}
          />
        </div>
      )}
    </div>
  );
}
