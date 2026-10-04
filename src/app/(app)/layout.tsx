import Link from "next/link";
import { BRAND } from "@/config/brand";
import { isFeatureEnabled, type FeatureKey } from "@/config/features";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { SignOutButton } from "@/components/SignOutButton";

// Orange icons live next to each item. Paths are Lucide-style (24x24 stroke);
// color comes from the brand config so a re-skin recolors them automatically.
// `feature` ties each item to a flag so disabled modules drop out of the nav.
const nav: { href: string; label: string; feature: FeatureKey; icon: React.ReactNode }[] = [
  {
    href: "/",
    label: "Dashboard",
    feature: "dashboard",
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
    feature: "properties",
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
    feature: "squatterWatch",
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
    feature: "portfolios",
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
    feature: "leases",
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
    feature: "tenants",
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
    feature: "workOrders",
    icon: (
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    ),
  },
  {
    href: "/search",
    label: "Search",
    feature: "search",
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  {
    href: "/inspections",
    label: "Inspections",
    feature: "inspections",
    icon: (
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
  },
  {
    href: "/invoicing",
    label: "Invoicing",
    feature: "invoicing",
    icon: (
      <>
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 17.5v-11" />
      </>
    ),
  },
];

// Sidebar layout: a sequence of standalone items and labeled groups. Items are
// referenced by feature key so the icon definitions above stay the single
// source of truth. "Property Data" groups the core records synced from the PMS
// (rename freely — it's intentionally source-neutral for the sellable product).
const navByFeature = Object.fromEntries(nav.map((i) => [i.feature, i])) as Record<
  FeatureKey,
  (typeof nav)[number]
>;

type NavEntry = { item: FeatureKey } | { heading: string; items: FeatureKey[] };
const navLayout: NavEntry[] = [
  { item: "dashboard" },
  { item: "search" },
  { item: "invoicing" },
  { item: "inspections" },
  {
    heading: "Property Data",
    items: ["properties", "squatterWatch", "portfolios", "leases", "tenants", "workOrders"],
  },
];

function NavLink({ item }: { item: (typeof nav)[number] }) {
  return (
    <Link
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
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — colors come straight from the brand config (inline, so they
          never depend on the CSS build). */}
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
          <span className="font-semibold tracking-tight text-white">{BRAND.name}</span>
        </Link>
        <nav className="flex flex-col gap-0.5 p-3 text-sm">
          {navLayout.map((entry) => {
            if ("item" in entry) {
              const item = navByFeature[entry.item];
              if (!item || !isFeatureEnabled(item.feature)) return null;
              return <NavLink key={item.href} item={item} />;
            }
            const groupItems = entry.items
              .map((f) => navByFeature[f])
              .filter((it) => it && isFeatureEnabled(it.feature));
            if (groupItems.length === 0) return null;
            return (
              <div
                key={entry.heading}
                className="mt-4 border-t pt-3"
                style={{ borderColor: "rgba(255,255,255,0.12)" }}
              >
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {entry.heading}
                </div>
                {groupItems.map((it) => (
                  <NavLink key={it.href} item={it} />
                ))}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto p-3 text-xs text-slate-500">{BRAND.tagline}</div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">{BRAND.tagline}</div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-slate-700">{user.name}</div>
                {user.role !== "user" && (
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    {user.role}
                  </div>
                )}
              </div>
              <SignOutButton />
            </div>
          ) : (
            <div className="text-sm font-medium text-slate-700">pland10</div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
