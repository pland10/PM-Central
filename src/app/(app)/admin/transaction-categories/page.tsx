import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isCategoryListOpen, listCategoryUsage } from "@/lib/transaction-categories-db";
import type { CategoryUsage } from "@/lib/transaction-categories";
import { TransactionCategoriesManager } from "./TransactionCategoriesManager";

// Admin → Transaction categories: the shared list behind "Category (yours)" on
// Accounting → Transactions — usage counts, look-alike flags, merge/delete,
// and the open/locked switch.
export const dynamic = "force-dynamic";

export default async function TransactionCategoriesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  let categories: CategoryUsage[] = [];
  let open = true;
  try {
    [categories, open] = await Promise.all([listCategoryUsage(), isCategoryListOpen()]);
  } catch {
    /* tables not reachable — show an empty list */
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction categories</h1>
        <p className="mt-1 text-sm text-slate-500">
          The list behind “Category (yours)” on{" "}
          <Link href="/accounting/transactions" className="font-medium text-brand-600 hover:underline">
            Accounting → Transactions
          </Link>
          . Typing a look-alike of a listed category (e.g. “pay roll” for “Payroll”) saves under the
          listed spelling. Merge duplicates to move their transactions to the right name.
        </p>
      </div>
      <TransactionCategoriesManager initialCategories={categories} initialOpen={open} />
    </div>
  );
}
