"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

export type DelinquentLease = {
  key: string; // Lease.id
  tenant: string;
  address: string;
  amount: number;
  email: string | null;
  lastRemindedAt: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

export function SendReminders({ delinquencies }: { delinquencies: DelinquentLease[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const remindable = useMemo(() => delinquencies.filter((d) => d.email), [delinquencies]);
  const selectedIds = useMemo(() => remindable.filter((d) => sel[d.key]).map((d) => d.key), [remindable, sel]);
  const allChecked = remindable.length > 0 && selectedIds.length === remindable.length;

  function toggleAll() {
    setSel(allChecked ? {} : Object.fromEntries(remindable.map((d) => [d.key, true])));
  }

  async function send() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseIds: selectedIds }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      const parts = [`Sent ${d.sent} reminder${d.sent === 1 ? "" : "s"}.`];
      if (d.failed?.length) parts.push(`${d.failed.length} failed.`);
      setResult({ tone: d.failed?.length ? "err" : "ok", text: parts.join(" ") });
      if (d.sent > 0) setSel({});
    } catch (e) {
      setResult({ tone: "err", text: e instanceof Error ? e.message : "Could not send." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={delinquencies.length === 0}
        className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Send reminders
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Send rent reminders">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">Send rent reminders</div>
                <div className="text-xs text-slate-500">Pick who to remind — the email is sent from you.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" aria-label="select-all" checked={allChecked} onChange={toggleAll} />
                Select all with an email
              </label>
              <span className="text-xs text-slate-400">{selectedIds.length} selected</span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              <ul className="space-y-1">
                {delinquencies.map((d) => (
                  <li key={d.key} className={`flex items-center gap-3 rounded-md px-2 py-2 ${d.email ? "" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      aria-label={`select-${d.key}`}
                      disabled={!d.email}
                      checked={!!sel[d.key]}
                      onChange={(e) => setSel((p) => ({ ...p, [d.key]: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{d.tenant}</div>
                      <div className="truncate text-xs text-slate-500">{d.address}</div>
                      {!d.email ? (
                        <div className="text-xs text-amber-600">No email on file — can&apos;t remind</div>
                      ) : d.lastRemindedAt ? (
                        <div className="text-xs text-slate-400">Reminded {fmtDate(d.lastRemindedAt)}</div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-medium text-red-600">{formatCurrency(d.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              {result ? (
                <span className={`text-xs ${result.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{result.text}</span>
              ) : (
                <span className="text-xs text-slate-400">Replies come back to you.</span>
              )}
              <button
                type="button"
                onClick={send}
                disabled={busy || selectedIds.length === 0}
                className="rounded-md border border-brand-600 bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Sending…" : `Send ${selectedIds.length || ""} reminder${selectedIds.length === 1 ? "" : "s"}`.replace("  ", " ")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
