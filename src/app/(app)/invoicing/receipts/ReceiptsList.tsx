"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_PARTIES, partyOf } from "@/config/invoicing-parties";
import { receiptTotal } from "@/lib/receipts";
import type { ReceiptRecord } from "@/lib/receipts-db";
import { formatCurrencyCents } from "@/lib/format";
import { formatDate } from "@/lib/invoices";

export function ReceiptsList({ receipts, isAdmin }: { receipts: ReceiptRecord[]; isAdmin: boolean }) {
  const router = useRouter();
  const [party, setParty] = useState("pmi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paidOut = receipts.reduce((s, r) => s + receiptTotal(r.items), 0);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invoicing/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing_party: party }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      router.push(`/invoicing/receipts/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  async function remove(r: ReceiptRecord) {
    if (!window.confirm(`Delete ${r.number}? It stops appearing in the list, but the record is kept.`)) return;
    const res = await fetch(`/api/invoicing/receipts/${r.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not delete.");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-ink">Inspector receipts</h1>
          <p className="text-sm text-slate-500">
            {receipts.length} receipt{receipts.length === 1 ? "" : "s"} · {formatCurrencyCents(paidOut)} paid out
          </p>
        </div>
        <select
          aria-label="Paid by"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {Object.values(BILLING_PARTIES).map((p) => (
            <option key={p.key} value={p.key}>
              {p.short}
            </option>
          ))}
        </select>
        <button
          onClick={create}
          disabled={busy}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "+ New receipt"}
        </button>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {receipts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No receipts yet. A receipt records paying an inspector for the visits they made — one line per inspection.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Receipt</th>
                <th className="px-4 py-2.5 font-semibold">From</th>
                <th className="px-4 py-2.5 font-semibold">Paid</th>
                <th className="px-4 py-2.5 font-semibold">Inspector</th>
                <th className="px-4 py-2.5 text-center font-semibold">Visits</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                {isAdmin && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={`/invoicing/receipts/${r.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{partyOf(r.billingParty).short}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDate(r.paidOn)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.inspector || <span className="text-slate-400">unnamed</span>}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{r.items.filter((it) => it.property || it.amount).length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyCents(receiptTotal(r.items))}</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => remove(r)} className="text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
