import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { fetchCashOnHand, fetchReimbursables, isRentvineConfigured } from "@/lib/accounting";
import { AccountingTabs } from "./AccountingTabs";
import { CashOnHand, Reimbursables } from "./OverviewSections";

// Accounting → Overview tab: live cash on hand + reimbursables from Rentvine,
// read on each load (no sync). The Transactions tab lives at
// /accounting/transactions.
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
      <Overview />
    </div>
  );
}

async function Overview() {
  if (!isRentvineConfigured()) {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Rentvine isn&apos;t configured for this environment. Set <code>RENTVINE_API_KEY</code> and{" "}
        <code>RENTVINE_API_SECRET</code> (and <code>RENTVINE_BASE_URL</code>) on the service to load
        live accounting figures.
      </p>
    );
  }

  const [cash, reimb] = await Promise.all([fetchCashOnHand(), fetchReimbursables()]);
  const asOf = (cash.ok && cash.asOf) || (reimb.ok && reimb.asOf) || "";

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">
          Live from Rentvine — cash across the bank accounts, and what&apos;s outstanding on the
          reimbursables account.
        </p>
        {asOf && <span className="text-xs text-slate-400">As of {asOf}</span>}
      </div>

      <CashOnHand cash={cash} />
      <Reimbursables reimb={reimb} />
    </>
  );
}
