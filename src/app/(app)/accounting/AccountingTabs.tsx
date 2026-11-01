"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab bar shared by the Accounting pages. Bank Transactions (card/bank activity,
// from Plaid) is the default and lives at /accounting; Rentvine Transactions
// (money-out payments, from Rentvine) lives at /accounting/rentvine.
const TABS = [
  { href: "/accounting", label: "Bank Transactions" },
  { href: "/accounting/rentvine", label: "Rentvine Transactions" },
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
