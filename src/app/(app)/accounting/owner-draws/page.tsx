import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting, canApproveOwnerDraws } from "@/lib/accounting-access";
import { buildDrawRows, isMonthKey, monthKeyET, prevMonthKey } from "@/lib/owner-draws";
import { listDrawMonths, listDrawRecords } from "@/lib/owner-draws-db";
import { loadOwnerDrawData } from "@/lib/owner-draws-rentvine";
import { AccountingTabs } from "../AccountingTabs";
import { OwnerDraws } from "./OwnerDraws";

// Accounting → Owner Draws: the monthly owner payout sheet. Balance, reserve
// and unpaid bills come live from Rentvine for the current month (editable per
// month); past months show what was saved/approved then. See src/lib/owner-draws.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function OwnerDrawsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  requireFeature("accounting");
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) notFound();

  const thisMonth = monthKeyET();
  const asked = (await searchParams).month;
  const month = isMonthKey(asked) && asked <= thisMonth ? asked : thisMonth;
  const isCurrent = month === thisMonth;

  const [live, records, previous, savedMonths] = await Promise.all([
    isCurrent ? loadOwnerDrawData() : Promise.resolve(null),
    listDrawRecords(month),
    listDrawRecords(prevMonthKey(month)),
    listDrawMonths(),
  ]);

  const rows = buildDrawRows({
    live: live?.ok ? live.portfolios : null,
    bills: live?.ok ? live.bills : new Map(),
    records,
    previous,
  });
  const months = [...new Set([thisMonth, prevMonthKey(thisMonth), ...savedMonths])].sort().reverse();
  const rentvineAccount = (process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse").trim();

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink">Accounting</h1>
      <AccountingTabs />
      {live && !live.ok && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load balances from Rentvine: {live.error}
        </p>
      )}
      <OwnerDraws
        key={month}
        month={month}
        months={months}
        isCurrent={isCurrent}
        initialRows={rows}
        canApprove={canApproveOwnerDraws(user)}
        rentvineAccount={rentvineAccount}
      />
    </div>
  );
}
