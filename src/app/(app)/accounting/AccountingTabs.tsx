"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab bar shared by the Accounting pages: Rentvine Transactions (money-out
// payments, from Rentvine) and Bank Transactions (card/bank activity, from Plaid).
const TABS = [
  { href: "/accounting", label: "Rentvine Transactions" },
  { href: "/accounting/transactions", label: "Bank Transactions" },
];

export function AccountingTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
