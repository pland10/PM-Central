"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import {
  summarizeByAccount,
  type AccountTotal,
  type BatchWithItems,
  type ManagementDrawRow,
} from "@/lib/payout-batches";

// Rentvine Transactions tab: the management-company trust draws (PMI Lighthouse
// + Reimbursable). Tick the payments you're moving from trust → operating and
// "lock in" a batch; batched payments drop off the To-draw list and live under
// Batches, where you can drill in and pull one back out if you made a mistake.
// Locking/removing only records the batch (keyed on Rentvine's payout id) — you
// still move the money at the bank.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ManagementDraws({
  initialRows,
  batches: initialBatches,
  asOf,
}: {
  initialRows: ManagementDrawRow[];
  batches: BatchWithItems[];
  asOf: string;
}) {
  const [rows, setRows] = useState<ManagementDrawRow[]>(initialRows);
  const [batches, setBatches] = useState<BatchWithItems[]>(initialBatches);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ batchId: number; count: number; total: number; byAccount: AccountTotal[] } | null>(null);
  const [undo, setUndo] = useState<{ amount: number; bankAccount: string; batchId: number } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const openRows = rows.filter((r) => !r.batched);
  const selectedRows = openRows.filter((r) => selected.has(r.payoutId));
  const selTotal = round2(selectedRows.reduce((s, r) => s + r.amount, 0));
  const selByAccount = summarizeByAccount(selectedRows);
  const allOpenSelected = openRows.length > 0 && selectedRows.length === openRows.length;

  const stats = useMemo(() => {
    const openTotal = round2(openRows.reduce((s, r) => s + r.amount, 0));
    const batchedTotal = round2(batches.reduce((s, b) => s + b.total, 0));
    return { openCount: openRows.length, openTotal, batchedCount: batches.reduce((s, b) => s + b.count, 0), batchedTotal };
  }, [openRows, batches]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allOpenSelected ? new Set() : new Set(openRows.map((r) => r.payoutId)));
  }
  function start() {
    setDone(null);
    setUndo(null);
    setError("");
    setSelecting(true);
  }
  function cancel() {
    setSelecting(false);
    setSelected(new Set());
    setNote("");
  }
  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function lockIn() {
    if (selectedRows.length === 0) return;
    setSaving(true);
    setError("");
    const picked = selectedRows;
    try {
      const res = await fetch("/api/accounting/payout-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          items: picked.map((r) => ({
            payoutId: r.payoutId,
            payee: r.payee,
            bankAccount: r.bankAccount,
            postedDate: r.date,
            memo: r.memo,
            amount: r.amount,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Couldn't lock the batch.");

      const ids = new Set(picked.map((r) => r.payoutId));
      const stamp = new Date().toISOString();
      setRows((prev) => prev.map((r) => (ids.has(r.payoutId) ? { ...r, batched: true, batchId: data.batchId, batchedAt: stamp } : r)));
      setBatches((prev) => [
        {
          id: data.batchId,
          createdAt: stamp,
          createdBy: "",
          note: note.trim(),
          count: data.count,
          total: data.total,
          items: picked.map((r) => ({ payoutId: r.payoutId, payee: r.payee, bankAccount: r.bankAccount, memo: r.memo, postedDate: r.date, amount: r.amount })),
        },
        ...prev,
      ]);
      setDone({ batchId: data.batchId, count: data.count, total: data.total, byAccount: summarizeByAccount(picked) });
      setExpanded((prev) => new Set(prev).add(data.batchId));
      setSelecting(false);
      setSelected(new Set());
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't lock the batch.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(payoutId: string) {
    setError("");
    try {
      const res = await fetch("/api/accounting/payout-batches/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.removed) throw new Error(typeof data?.error === "string" ? data.error : "Couldn't remove it.");

      const { amount, bankAccount, batchId } = data.removed as { amount: number; bankAccount: string; batchId: number };
      setUndo({ amount, bankAccount, batchId });
      setDone(null);
      // Drop the item from its batch (or the whole batch if it's now empty).
      setBatches((prev) =>
        prev
          .map((b) => {
            if (b.id !== batchId) return b;
            const items = b.items.filter((i) => i.payoutId !== payoutId);
            return { ...b, items, count: items.length, total: round2(b.total - amount) };
          })
          .filter((b) => !(b.id === batchId && data.batchEmptied))
      );
      // The payment returns to the To-draw list (if it's still in the window).
      setRows((prev) => prev.map((r) => (r.payoutId === payoutId ? { ...r, batched: false, batchId: null, batchedAt: null } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.");
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="To draw" value={formatCurrency(stats.openTotal)} hint={`${stats.openCount} payment${stats.openCount === 1 ? "" : "s"}`} tone={stats.openCount > 0 ? "amber" : "slate"} />
        <Tile label="Batched" value={formatCurrency(stats.batchedTotal)} hint={`${stats.batchedCount} in ${batches.length} batch${batches.length === 1 ? "" : "es"}`} tone="emerald" />
        <Tile label="All draws" value={formatCurrency(round2(stats.openTotal + stats.batchedTotal))} hint="trust → operating" tone="slate" />
      </div>

      {done && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">
            ✓ Batch #{done.batchId} locked — {formatCurrency(done.total)} across {done.count} payment{done.count === 1 ? "" : "s"}.
          </div>
          <div className="mt-1">Now move the money to <span className="font-semibold">Operating</span> at the bank:</div>
          <ul className="mt-1 space-y-0.5">
            {done.byAccount.map((a) => (
              <li key={a.account}>
                <span className="font-semibold">{formatCurrency(a.total)}</span> from {a.account}{" "}
                <span className="text-emerald-700/70">({a.count} payment{a.count === 1 ? "" : "s"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {undo && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Pulled a payment back out of batch #{undo.batchId}. If you&apos;d already moved the money, move{" "}
          <span className="font-semibold">{formatCurrency(undo.amount)}</span> back from{" "}
          <span className="font-semibold">Operating</span> to{" "}
          <span className="font-semibold">{undo.bankAccount || "Trust"}</span>.
        </div>
      )}

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Action bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {!selecting ? (
          <button type="button" onClick={start} disabled={stats.openCount === 0} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
            Pay the management company
          </button>
        ) : (
          <>
            <span className="font-medium text-slate-700">{selectedRows.length} selected · {formatCurrency(selTotal)}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Batch note (optional)"
              aria-label="Batch note"
              className="w-48 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
            />
            <button type="button" onClick={lockIn} disabled={saving || selectedRows.length === 0} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
              {saving ? "Locking…" : "Lock in batch"}
            </button>
            <button type="button" onClick={cancel} className="ml-auto text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </>
        )}
      </div>

      {selecting && selByAccount.length > 0 && (
        <p className="mb-3 -mt-1 text-xs text-slate-500">
          From: {selByAccount.map((a) => `${a.account} ${formatCurrency(a.total)}`).join(" · ")}
        </p>
      )}

      {openRows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Nothing left to draw — every management-company payment in the last 90 days is batched.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {selecting && (
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="select-all"
                      checked={allOpenSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedRows.length > 0 && selectedRows.length < openRows.length;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-brand-500"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Payee</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Memo</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openRows.map((r) => (
                <tr key={r.payoutId} className={`align-top ${selected.has(r.payoutId) ? "bg-brand-50" : ""}`}>
                  {selecting && (
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`select-${r.payoutId}`} checked={selected.has(r.payoutId)} onChange={() => toggle(r.payoutId)} className="h-4 w-4 accent-brand-500" />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-slate-800">{r.payee || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.bankAccount || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.memo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batches.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Batches</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {batches.map((b) => {
              const open = expanded.has(b.id);
              return (
                <div key={b.id}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(b.id)}
                    aria-label={`batch-${b.id}`}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-400">{open ? "▾" : "▸"}</span>
                    <span className="font-medium text-slate-700">#{b.id}</span>
                    <span className="text-slate-500">{fmtDate(b.createdAt)}</span>
                    {b.note && <span className="truncate text-slate-500">— {b.note}</span>}
                    <span className="ml-auto whitespace-nowrap text-slate-500">{b.count} payment{b.count === 1 ? "" : "s"}</span>
                    <span className="w-24 whitespace-nowrap text-right font-semibold tabular-nums text-slate-800">{formatCurrency(b.total)}</span>
                  </button>
                  {open && (
                    <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 px-3 py-2">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Payee</th>
                            <th className="py-1 pr-3 font-medium">Account</th>
                            <th className="py-1 pr-3 font-medium">Memo</th>
                            <th className="py-1 pr-3 text-right font-medium">Amount</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {b.items.map((it) => (
                            <tr key={it.payoutId} className="align-top">
                              <td className="py-1 pr-3 text-slate-700">{it.payee || "—"}</td>
                              <td className="whitespace-nowrap py-1 pr-3 text-slate-600">{it.bankAccount || "—"}</td>
                              <td className="py-1 pr-3 text-slate-600">{it.memo || "—"}</td>
                              <td className="whitespace-nowrap py-1 pr-3 text-right tabular-nums text-slate-800">{formatCurrency(it.amount)}</td>
                              <td className="py-1 text-right">
                                <button
                                  type="button"
                                  aria-label={`remove-${it.payoutId}`}
                                  onClick={() => removeItem(it.payoutId)}
                                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-red-400 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                          {b.items.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-2 text-center text-xs text-slate-400">No payments in this batch.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
