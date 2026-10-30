import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { fetchManagementDraws, isRentvineConfigured } from "@/lib/accounting";
import { prisma } from "@/lib/prisma";
import { fetchBatchedMap, listRecentBatches, mergeBatched } from "@/lib/payout-batches";
import { AccountingTabs } from "./AccountingTabs";
import { ManagementDraws } from "./ManagementDraws";

// Accounting → Rentvine Transactions tab: the management-company trust draws
// (PMI Lighthouse + Reimbursable) read live from Rentvine, with the batching
// workflow for moving money from trust → operating. The Bank Transactions tab
// (Plaid) lives at /accounting/transactions.
export const dynamic = "force-dynamic";
// Live Rentvine report fetches — headroom for serverless (Vercel); no-op on Railway.
export const maxDuration = 60;

export default async function AccountingPage() {
  requireFeature("accounting");
  if (!canAccessAccounting(await getCurrentUser())) notFound();
  return (
    <div className="mx-auto max-w-6xl">
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

  const draws = await fetchManagementDraws();
  if (!draws.ok) {
    return (
      <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Couldn&apos;t load payments from Rentvine: {draws.error}
      </p>
    );
  }

  const [batched, recent] = await Promise.all([
    fetchBatchedMap(prisma, draws.rows.map((r) => r.payoutId)),
    listRecentBatches(prisma),
  ]);
  const rows = mergeBatched(draws.rows, batched);

  return <ManagementDraws initialRows={rows} recentBatches={recent} asOf={draws.asOf} />;
}
