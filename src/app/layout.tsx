import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { BRAND, brandCssVars } from "@/config/brand";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — ${BRAND.tagline}`,
};

// Orange icons live next to each item. Paths are Lucide-style (24x24 stroke);
// color comes from the brand config so a re-skin recolors them automatically.
const nav = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </>
    ),
  },
  {
    href: "/properties",
    label: "Properties",
    icon: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
      </>
    ),
  },
  {
    href: "/squatter-watch",
    label: "Squatter Watch",
    icon: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    href: "/portfolios",
    label: "Portfolios",
    icon: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
  },
  {
    href: "/leases",
    label: "Leases",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </>
    ),
  },
  {
    href: "/tenants",
    label: "Tenants",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    href: "/work-orders",
    label: "Work Orders",
    icon: (
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    ),
  },
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
          {/* Sidebar — colors come straight from the brand config (inline, so
              they never depend on the CSS build). */}
          <aside
            className="hidden w-56 shrink-0 flex-col text-slate-300 md:flex"
            style={{ backgroundColor: BRAND.colors.ink }}
          >
            <Link
              href="/"
              className="flex h-14 items-center gap-2.5 px-4 transition-colors hover:bg-white/5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
            >
              <Logo />
              <span className="font-semibold tracking-tight text-white">
                {BRAND.name}
              </span>
            </Link>
            <nav className="flex flex-col gap-1 p-3 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                    style={{ color: BRAND.colors.primary }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </svg>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-3 text-xs text-slate-500">
              {BRAND.tagline}
            </div>
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
