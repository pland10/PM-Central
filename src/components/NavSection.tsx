"use client";

import { useState, type ReactNode } from "react";
import { NAV_SECTIONS_COOKIE, parseClosedSections, serializeClosedSections } from "@/lib/sidebar";

// A headed group in the desktop sidebar (Property Data, Admin…) whose heading
// folds it open/closed. Closed sections are remembered in a cookie the server
// layout reads. In the icon-rail mode the heading is hidden and every icon
// shows anyway (globals.css: .nav-section-closed is only applied when expanded).

function readClosed(): string[] {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${NAV_SECTIONS_COOKIE}=`));
  return parseClosedSections(hit ? decodeURIComponent(hit.slice(NAV_SECTIONS_COOKIE.length + 1)) : "");
}

export function NavSection({
  id,
  heading,
  initialOpen,
  children,
}: {
  id: string;
  heading: string;
  initialOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Re-read the cookie so another section's choice isn't overwritten.
    const others = readClosed().filter((x) => x !== id);
    const closed = serializeClosedSections(next ? others : [...others, id]);
    document.cookie = `${NAV_SECTIONS_COOKIE}=${encodeURIComponent(closed)}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`nav-section-${id}`}
        className="nav-label mb-1.5 flex w-full items-center justify-between rounded px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-white"
      >
        <span>{heading}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        id={`nav-section-${id}`}
        data-testid={`nav-section-items-${id}`}
        className={open ? undefined : "nav-section-closed"}
      >
        {children}
      </div>
    </div>
  );
}
