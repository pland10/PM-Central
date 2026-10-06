"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { PaymentAsOf } from "@/lib/payments-dashboard";

const STALE_DAYS = 10;

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ageDays(posted: string | null, asOf: string): number | null {
  if (!posted) return null;
  return Math.round((Date.parse(asOf) - Date.parse(posted)) / 86_400_000);
}

export function PaymentsPane({ initial }: { initial: PaymentAsOf }) {
  const [data, setData] = useState<PaymentAsOf>(initial);
  const [date, setDate] = useState(initial.asOf);
  const [loading, setLoading] = useState(false);
  const today = initial.asOf;

  async function pick(d: string) {
    setDate(d);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payments?asOf=${d}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const isToday = data.asOf === today;
  const whenLabel = isToday ? "today" : fmtDate(data.asOf);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          Payments
          {!isToday && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium normal-case text-slate-500">
              as of {fmtDate(data.asOf)}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => pick(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 outline-none focus:border-brand-500"
            aria-label="Payments as of date"
          />
          {!isToday && (
            <button
              onClick={() => pick(today)}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-2 text-center transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Pending (in-flight)</div>
          <div className="mt-0.5 text-base font-semibold text-amber-600">{formatCurrency(data.pendingTotal)}</div>
          <div className="text-[11px] text-slate-400">{data.pendingCount} as of {whenLabel}</div>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Cleared</div>
          <div className="mt-0.5 text-base font-semibold text-emerald-600">{formatCurrency(data.clearedTotal)}</div>
          <div className="text-[11px] text-slate-400">{data.clearedCount} on {whenLabel}</div>
        </div>
      </div>

      {data.pendingStale > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          ⚠ {data.pendingStale} pending over {STALE_DAYS} days — worth chasing
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Open payments {isToday ? "to watch" : `as of ${fmtDate(data.asOf)}`}
        </div>
        {data.pending.length === 0 ? (
          <div className="py-5 text-center text-sm text-slate-400">Nothing in flight as of {whenLabel}.</div>
        ) : (
          data.pending.map((p) => {
            const days = ageDays(p.date_posted, data.asOf);
            const tone = days != null && days > STALE_DAYS ? "text-amber-600" : "text-slate-400";
            return (
              <div
                key={p.source_id}
                className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{p.tenant || "Unknown tenant"}</div>
                  <div className="truncate text-xs text-slate-500">{p.property_address || "—"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium text-slate-700">{formatCurrency(p.amount)}</div>
                  {days != null && <div className={`text-xs ${tone}`}>{days}d in flight</div>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 text-right">
        <Link href="/search?types=payment" className="text-xs font-medium text-brand-600 hover:underline">
          Search payments →
        </Link>
      </div>
    </section>
  );
}
