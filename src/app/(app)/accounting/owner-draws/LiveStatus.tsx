"use client";

import { useEffect } from "react";

// The line above the Owner Draws sheet: when the Rentvine figures are from (they
// may be a few minutes cached — see src/lib/owner-draws-rentvine.ts), a stale
// warning when Rentvine failed and we fell back to the last good figures, or
// the error with a Retry link. Refresh/Retry add ?refresh=1 to skip the cache;
// we drop it from the address bar afterwards so a plain reload uses the cache.

export type LiveSummary =
  | { ok: true; asOf: string; stale?: boolean; staleReason?: string; portfolios?: unknown; bills?: unknown }
  | { ok: false; error: string; status?: number; busy?: boolean };

const REFRESH_HREF = "/accounting/owner-draws?refresh=1";

const timeET = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

export function LiveStatus({ live }: { live: LiveSummary }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("refresh")) {
      url.searchParams.delete("refresh");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const link = (label: string) => (
    <a href={REFRESH_HREF} className="font-medium underline underline-offset-2">
      {label}
    </a>
  );

  if (!live.ok) {
    return (
      <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Couldn&apos;t load balances from Rentvine: {live.error} {link("Retry")}
      </p>
    );
  }
  if (live.stale) {
    return (
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {live.staleReason}, so this is showing the figures from {timeET(live.asOf)}. {link("Retry")}
      </p>
    );
  }
  return (
    <p className="mb-3 text-xs text-slate-500">
      Rentvine figures as of {timeET(live.asOf)} · {link("Refresh")}
    </p>
  );
}
