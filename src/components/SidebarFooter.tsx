"use client";

import { BRAND } from "@/config/brand";

// Bottom of the desktop sidebar: a Refresh button (installed Chrome apps tuck
// reload away under the ⋯ menu) and the tagline with the running version.
export function SidebarFooter({ tagline, version }: { tagline: string; version: string }) {
  return (
    <div className="mt-auto flex flex-col gap-2 p-3">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
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
          <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        Refresh
      </button>
      <div className="px-3 text-xs leading-snug text-slate-500">
        <div>{tagline}</div>
        <div className="text-[11px] text-slate-600">{version}</div>
      </div>
    </div>
  );
}
