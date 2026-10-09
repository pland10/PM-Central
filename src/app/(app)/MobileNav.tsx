"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/config/brand";
import { Logo } from "@/components/Logo";

// Mobile navigation: a hamburger button + slide-in drawer, shown only below the
// `md` breakpoint where the desktop sidebar is hidden. The server layout resolves
// which items are visible (feature flags + admin) and passes them in, so this
// stays the mobile presentation only and the nav contents have one source.

export type MobileNavItem = { href: string; label: string; icon: ReactNode };
export type MobileNavSection = { heading: string | null; items: MobileNavItem[] };

function NavIcon({ icon }: { icon: ReactNode }) {
  return (
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
      {icon}
    </svg>
  );
}

export function MobileNav({
  sections,
  isAdmin,
  light = false,
}: {
  sections: MobileNavSection[];
  isAdmin: boolean;
  light?: boolean; // true on the colored env header (white trigger), else dark
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change and lock body scroll while open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`-ml-1 rounded-md p-1.5 md:hidden ${light ? "text-white" : "text-slate-700"}`}
        aria-label="Open navigation"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside
            className="absolute left-0 top-0 flex h-full w-64 flex-col text-slate-300 shadow-xl"
            style={{ backgroundColor: BRAND.colors.ink }}
          >
            <div
              className="flex h-14 shrink-0 items-center justify-between px-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
            >
              <Link href="/" onClick={() => setOpen(false)}>
                <Logo dark className="h-9 w-auto max-w-[150px] object-contain" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label="Close navigation"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 overflow-y-auto p-3 text-sm">
              {sections.map((section, i) => {
                const links = section.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <NavIcon icon={it.icon} />
                    {it.label}
                  </Link>
                ));
                if (!section.heading) return <div key={`s${i}`}>{links}</div>;
                return (
                  <div
                    key={section.heading}
                    className="mt-4 border-t pt-3"
                    style={{ borderColor: "rgba(255,255,255,0.12)" }}
                  >
                    <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {section.heading}
                    </div>
                    {links}
                  </div>
                );
              })}

              {isAdmin && (
                <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                  <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Admin
                  </div>
                  <Link
                    href="/admin/data"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <NavIcon
                      icon={
                        <>
                          <ellipse cx="12" cy="5" rx="9" ry="3" />
                          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                          <path d="M3 12a9 3 0 0 0 18 0" />
                        </>
                      }
                    />
                    Data sources
                  </Link>
                </div>
              )}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
