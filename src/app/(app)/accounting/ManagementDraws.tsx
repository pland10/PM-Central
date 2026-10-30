"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { ManagementDrawRow, BatchSummary } from "@/lib/payout-batches";

// Rentvine Transactions tab: the management-company trust draws (PMI Lighthouse
// + Reimbursable). Review the payments, tick the ones you're about to move from
// trust → operating, and "lock in" a batch. Locking only records the batch
// (keyed on Rentvine's payout id so nothing is drawn twice) — you still move the
// money at the bank.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ManagementDraws({
  initialRows,
  recentBatches,
  asOf,
}: {
  initialRows: ManagementDrawRow[];
  recentBatches: BatchSummary[];
  asOf: string;
}) {
  const [rows, setRows] = useState<ManagementDrawRow[]>(initialRows);
  const [batches, setBatches] = useState<BatchSummary[]>(recentBatches);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ batchId: number; count: number; total: number } | null>(null);

  const stats = useMemo(() => {
    let batchedCount = 0;
    let batchedTotal = 0;
    let openCount = 0;
    let openTotal = 0;
    for (const r of rows) {
      if (r.batched) {
        batchedCount++;
        batchedTotal += r.amount;
      } else {
        openCount++;
        openTotal += r.amount;
      }
    }
    return { batchedCount, batchedTotal: round2(batchedTotal), openCount, openTotal: round2(openTotal) };
  }, [rows]);

  const selectedRows = rows.filter((r) => selected.has(r.payoutId) && !r.batched);
  const selTotal = round2(selectedRows.reduce((s, r) => s + r.amount, 0));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    setDone(null);
    setError("");
    setSelecting(true);
  }
  function cancel() {
    setSelecting(false);
    setSelected(new Set());
  }
  function selectAllOpen() {
    setSelected(new Set(rows.filter((r) => !r.batched).map((r) => r.payoutId)));
  }

  async function lockIn() {
    if (selectedRows.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/accounting/payout-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedRows.map((r) => ({
            payoutId: r.payoutId,
            payee: r.payee,
            postedDate: r.date,
            memo: r.memo,
            amount: r.amount,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Couldn't lock the batch.");

      const ids = new Set(selectedRows.map((r) => r.payoutId));
      const stamp = new Date().toISOString();
      setRows((prev) =>
        prev.map((r) => (ids.has(r.payoutId) ? { ...r, batched: true, batchId: data.batchId, batchedAt: stamp } : r))
      );
      setBatches((prev) => [
        { id: data.batchId, createdAt: stamp, createdBy: "", note: "", count: data.count, total: data.total },
        ...prev,
      ]);
      setDone({ batchId: data.batchId, count: data.count, total: data.total });
      setSelecting(false);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't lock the batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">
          Payments to PMI Lighthouse (management fees &amp; reimbursables) — the money you move from
          trust to operating. Tick the ones you&apos;re taking and lock them into a batch.
        </p>
        {asOf && <span className="text-xs text-slate-400">As of {asOf}</span>}
      </div>

      {/* Summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="To draw" value={formatCurrency(stats.openTotal)} hint={`${stats.openCount} payment${stats.openCount === 1 ? "" : "s"} not yet batched`} tone={stats.openCount > 0 ? "amber" : "slate"} />
        <Tile label="Batched" value={formatCurrency(stats.batchedTotal)} hint={`${stats.batchedCount} done`} tone="emerald" />
        <Tile label="All draws" value={formatCurrency(round2(stats.openTotal + stats.batchedTotal))} hint={`${rows.length} total`} tone="slate" />
      </div>

      {done && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">
            ✓ Batch #{done.batchId} locked — {formatCurrency(done.total)} across {done.count} payment
            {done.count === 1 ? "" : "s"}.
          </div>
          <div className="mt-1">
            Now go to the bank and move <span className="font-semibold">{formatCurrency(done.total)}</span> from the{" "}
            <span className="font-semibold">Trust</span> account to <span className="font-semibold">Operating</span>.
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Action bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {!selecting ? (
          <button
            type="button"
            onClick={start}
            disabled={stats.openCount === 0}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Pay the management company
          </button>
        ) : (
          <>
            <span className="font-medium text-slate-700">
              {selectedRows.length} selected · {formatCurrency(selTotal)}
            </span>
            <button type="button" onClick={selectAllOpen} className={BTN}>
              Select all to-draw
            </button>
            <button
              type="button"
              onClick={lockIn}
              disabled={saving || selectedRows.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Locking…" : "Lock in batch"}
            </button>
            <button type="button" onClick={cancel} className="ml-auto text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No management-company payments in the last 90 days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {selecting && <th className="w-8 px-3 py-2" />}
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Payee</th>
                <th className="px-3 py-2 font-medium">Memo</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.payoutId} className={`align-top ${selected.has(r.payoutId) ? "bg-brand-50" : ""}`}>
                  {selecting && (
                    <td className="px-3 py-2">
                      {!r.batched && (
                        <input
                          type="checkbox"
                          aria-label={`select-${r.payoutId}`}
                          checked={selected.has(r.payoutId)}
                          onChange={() => toggle(r.payoutId)}
                          className="h-4 w-4 accent-brand-500"
                        />
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-slate-800">{r.payee || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.memo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.batched ? (
                      <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        Batched · #{r.batchId}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">To draw</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batches.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent batches</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Total moved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-medium text-slate-700">#{b.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(b.createdAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{b.count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                      {formatCurrency(b.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const BTN =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600";

const TILE_TONES: Record<string, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  slate: "text-slate-800",
};

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: keyof typeof TILE_TONES }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${TILE_TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}
