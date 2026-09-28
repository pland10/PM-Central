import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { BRAND, brandCssVars } from "@/config/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — ${BRAND.tagline}`,
};

const nav = [
  { href: "/properties", label: "Properties" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/leases", label: "Leases" },
  { href: "/tenants", label: "Tenants" },
  { href: "/work-orders", label: "Work Orders" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Brand colors, from src/config/brand.ts */}
        <style dangerouslySetInnerHTML={{ __html: brandCssVars() }} />
      </head>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col bg-ink text-slate-300 md:flex">
            <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white">
                {BRAND.shortName}
              </div>
              <span className="font-semibold tracking-tight text-white">{BRAND.name}</span>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-slate-300 transition-colors hover:bg-ink-soft hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-3 text-xs text-slate-500">{BRAND.tagline}</div>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
              <div className="text-sm text-slate-500">{BRAND.tagline}</div>
              <div className="text-sm font-medium text-slate-700">pland10</div>
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
