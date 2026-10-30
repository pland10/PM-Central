import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { fetchMoneyOut, isRentvineConfigured } from "@/lib/accounting";
import { AccountingTabs } from "./AccountingTabs";
import { MoneyOut } from "./OverviewSections";

// Accounting → Rentvine Transactions tab: live "money out" payments from
// Rentvine (Check Register), read on each load (no sync). The Bank Transactions
// tab (Plaid) lives at /accounting/transactions.
export const dynamic = "force-dynamic";
// Live Rentvine report fetches — headroom for serverless (Vercel); no-op on Railway.
export const maxDuration = 60;

export default async function AccountingPage() {
  requireFeature("accounting");
  if (!canAccessAccounting(await getCurrentUser())) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-lg font-semibold text-ink">Accounting</h1>
      <AccountingTabs />
      <RentvineTransactions />
    </div>
  );
}

async function RentvineTransactions() {
  if (!isRentvineConfigured()) {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Rentvine isn&apos;t configured for this environment. Set <code>RENTVINE_API_KEY</code> and{" "}
        <code>RENTVINE_API_SECRET</code> (and <code>RENTVINE_BASE_URL</code>) on the service to load
        live payments.
      </p>
    );
  }

  const data = await fetchMoneyOut();

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">
          Money out — payments written from your Rentvine bank accounts over the last 90 days, with
          who each one was paid to.
        </p>
        {data.ok && data.asOf && <span className="text-xs text-slate-400">As of {data.asOf}</span>}
      </div>

      <MoneyOut data={data} />
    </>
  );
}
