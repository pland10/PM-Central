import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listHideRulesSafe } from "@/lib/transaction-filters-db";
import { TransactionFiltersManager } from "./TransactionFiltersManager";

// Admin → Transaction filters: patterns (e.g. *CSG FORTE*) whose matching
// card/bank transactions are hidden from Accounting → Transactions.
export const dynamic = "force-dynamic";

export default async function TransactionFiltersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const rules = await listHideRulesSafe();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction filters</h1>
        <p className="mt-1 text-sm text-slate-500">
          Transactions whose description or merchant match a filter are hidden from{" "}
          <Link href="/accounting/transactions" className="font-medium text-brand-600 hover:underline">
            Accounting → Transactions
          </Link>{" "}
          and left out of its totals. Use <code>*</code> as a wildcard (e.g. <code>*CSG FORTE*</code>);
          text without <code>*</code> matches anywhere. Not case-sensitive. Removing a filter brings
          its transactions back.
        </p>
      </div>
      <TransactionFiltersManager initialRules={rules} />
    </div>
  );
}
