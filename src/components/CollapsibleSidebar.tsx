"use client";

import { useState, type ReactNode } from "react";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

// The desktop sidebar's shell: full width (labels) or a narrow icon rail. The
// choice is kept in a cookie so the server renders the right width on the next
// page load (no flash). What hides when collapsed is plain CSS keyed off
// data-collapsed (see globals.css: .nav-label / .nav-collapsed-only).

export { SIDEBAR_COOKIE };

export function CollapsibleSidebar({
  initialCollapsed,
  style,
  children,
  footer,
}: {
  initialCollapsed: boolean;
  style?: React.CSSProperties;
  children: ReactNode; // logo + nav
  footer?: ReactNode; // pinned to the bottom, under the toggle
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={`hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden text-slate-300 transition-[width] duration-150 md:flex ${
        collapsed ? "w-16" : "w-56"
      }`}
      style={style}
    >
      {children}
      <div className="mt-auto px-3 pt-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d={collapsed ? "m13 9 3 3-3 3" : "m16 15-3-3 3-3"} />
          </svg>
          <span className="nav-label">Collapse</span>
        </button>
      </div>
      {footer}
    </aside>
  );
}
