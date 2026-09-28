import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PM-Central",
  description: "A property management hub — starting with your properties.",
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
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
            <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-sm font-bold text-white">
                PM
              </div>
              <span className="font-semibold tracking-tight">PM-Central</span>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
              <div className="text-sm text-slate-500">Property Management Hub</div>
              <div className="text-sm font-medium text-slate-700">pland10</div>
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
