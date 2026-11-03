"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab bar shared by the Invoicing pages (ported from the standalone app's
// Invoices · Billing · Customers · Receipts · Properties views).
const TABS = [
  { href: "/invoicing", label: "Invoices" },
  { href: "/invoicing/billing", label: "Billing" },
  { href: "/invoicing/customers", label: "Customers" },
  { href: "/invoicing/receipts", label: "Receipts" },
  { href: "/invoicing/properties", label: "Properties" },
];

export function InvoicingTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        // Sub-pages (e.g. a receipt) keep their tab lit; Invoices only on its own path.
        const active = t.href === "/invoicing" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
