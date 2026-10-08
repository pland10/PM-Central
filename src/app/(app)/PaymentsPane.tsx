"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { PaymentAsOf, PaymentLine } from "@/lib/payments-dashboard";

const STALE_DAYS = 10;

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShort(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ageDays(posted: string | null, asOf: string): number | null {
  if (!posted) return null;
  return Math.round((Date.parse(asOf) - Date.parse(posted)) / 86_400_000);
}

function Stat({ label, total, count, tone }: { label: string; total: number; count: number; tone: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${tone}`}>{formatCurrency(total)}</div>
      <div className="text-[11px] text-slate-400">{count} {count === 1 ? "payment" : "payments"}</div>
    </div>
  );
}

export function PaymentsPane({ initial }: { initial: PaymentAsOf }) {
  const [data, setData] = useState<PaymentAsOf>(initial);
  const [date, setDate] = useState(initial.asOf);
  const [loading, setLoading] = useState(false);
  const [showAllCleared, setShowAllCleared] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);
  const [showAllReturns, setShowAllReturns] = useState(false);
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

  const owners = showAllCleared ? data.clearedByOwner : data.clearedByOwner.slice(0, 4);
  const returns = showAllReturns ? data.returned : data.returned.slice(0, 5);
  const pending = showAllPending ? data.pending : data.pending.slice(0, 5);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          Rent settlements
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
            aria-label="Settlements as of date"
          />
          {!isToday && (
            <button onClick={() => pick(today)} className="text-xs font-medium text-brand-600 hover:underline">
              Today
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-3 gap-2 text-center transition-opacity ${loading ? "opacity-50" : ""}`}>
        <Stat label="Now payable" total={data.clearedTotal} count={data.clearedCount} tone="text-emerald-600" />
        <Stat label="In flight" total={data.pendingTotal} count={data.pendingCount} tone="text-amber-600" />
        <Stat label="Returns / NSF" total={data.returnedTotal} count={data.returnedCount} tone="text-red-600" />
      </div>

      {data.pendingStale > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          ⚠ {data.pendingStale} pending over {STALE_DAYS} days — likely stuck, worth chasing
        </div>
      )}

      {/* Cleared — funds now available, grouped by owner (who can be paid) */}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Cleared — funds now available
        </div>
        {data.clearedByOwner.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">Nothing new cleared {isToday ? "today" : "then"}.</div>
        ) : (
          <>
            {owners.map((g) => (
              <div key={g.owner} className="border-b border-slate-100 py-2 last:border-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800">{g.owner}</span>
                  <span className="shrink-0 font-semibold text-emerald-700">{formatCurrency(g.total)}</span>
                </div>
                <div className="mt-1 pl-3">
                  {g.lines.map((l) => (
                    <PaymentRow key={l.source_id} p={l} asOf={data.asOf} whenField="none" />
                  ))}
                </div>
              </div>
            ))}
            {data.clearedByOwner.length > 4 && (
              <button
                onClick={() => setShowAllCleared((v) => !v)}
                className="mt-2 w-full text-center text-xs font-medium text-brand-600 hover:underline"
              >
                {showAllCleared ? "Show less" : `Show all ${data.clearedByOwner.length} owners →`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Returns / NSF — do not disburse */}
      {data.returned.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-700">
            Returns / NSF — do not disburse
          </div>
          {returns.map((r) => (
            <PaymentRow key={r.source_id} p={r} asOf={data.asOf} whenField="posted" />
          ))}
          {data.returned.length > 5 && (
            <button
              onClick={() => setShowAllReturns((v) => !v)}
              className="mt-2 w-full text-center text-xs font-medium text-brand-600 hover:underline"
            >
              {showAllReturns ? "Show less" : `Show all ${data.returned.length} →`}
            </button>
          )}
        </div>
      )}

      {/* Pending — in flight, oldest first */}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Pending {isToday ? "to watch" : `as of ${fmtDate(data.asOf)}`}
        </div>
        {data.pending.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">Nothing in flight as of {whenLabel}.</div>
        ) : (
          <>
            {pending.map((p) => (
              <PaymentRow key={p.source_id} p={p} asOf={data.asOf} whenField="age" />
            ))}
            {data.pending.length > 5 && (
              <button
                onClick={() => setShowAllPending((v) => !v)}
                className="mt-2 w-full text-center text-xs font-medium text-brand-600 hover:underline"
              >
                {showAllPending ? "Show less" : `Show all ${data.pending.length} →`}
              </button>
            )}
          </>
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

function PaymentRow({
  p,
  asOf,
  whenField,
}: {
  p: PaymentLine;
  asOf: string;
  whenField: "age" | "posted" | "none";
}) {
  const days = ageDays(p.date_posted, asOf);
  const tone = days != null && days > STALE_DAYS ? "text-amber-600" : "text-slate-400";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-800">{p.tenant || "Unknown tenant"}</div>
        <div className="truncate text-xs text-slate-500">{p.property_address || "—"}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-medium text-slate-700">{formatCurrency(p.amount)}</div>
        {whenField === "age" && days != null && <div className={`text-xs ${tone}`}>{days}d in flight</div>}
        {whenField === "posted" && <div className="text-xs text-slate-400">paid {fmtShort(p.date_posted)}</div>}
      </div>
    </div>
  );
}
