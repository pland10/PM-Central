"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { partyOf } from "@/config/invoicing-parties";
import { receiptTotal, type ReceiptItem } from "@/lib/receipts";
import type { ReceiptRecord } from "@/lib/receipts-db";
import { formatCurrencyCents } from "@/lib/format";

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

// Edit an inspector receipt: who was paid, when and how, and one line per
// inspection. Only properties in the Squatter Watch programme can be picked; an
// address already on the receipt that has since left the programme still shows.
export function ReceiptEditor({ receipt, addresses }: { receipt: ReceiptRecord; addresses: string[] }) {
  const router = useRouter();
  const [r, setR] = useState(receipt);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const party = partyOf(r.billingParty);

  const set = <K extends keyof ReceiptRecord>(k: K, v: ReceiptRecord[K]) => {
    setR((x) => ({ ...x, [k]: v }));
    setState("");
  };
  const setItem = (i: number, patch: Partial<ReceiptItem>) =>
    set("items", r.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function save() {
    setState("saving");
    setError("");
    const res = await fetch(`/api/invoicing/receipts/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || `Could not save (${res.status})`);
      setState("");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <div className="max-w-3xl rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Receipt · {party.label}</div>
          <div className="font-mono text-lg font-semibold text-slate-800">{r.number}</div>
        </div>
        <div className="flex items-center gap-2">
          {state === "saved" && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          <a
            href={`/receipt-print/${r.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print / PDF
          </a>
          <button
            onClick={save}
            disabled={state === "saving"}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500 sm:col-span-2">
          Paid to (inspector)
          <input className={input} value={r.inspector} onChange={(e) => set("inspector", e.target.value)} placeholder="Inspector name" />
        </label>
        <label className="text-xs text-slate-500">
          Paid on
          <input className={input} type="date" value={r.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
        </label>
        <label className="text-xs text-slate-500">
          Method
          <input className={input} value={r.method ?? ""} onChange={(e) => set("method", e.target.value)} placeholder="Zelle / check / cash" />
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2">
          Reference
          <input className={input} value={r.reference ?? ""} onChange={(e) => set("reference", e.target.value)} placeholder="check # / confirmation" />
        </label>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Property inspected</th>
            <th className="w-40 py-2 font-semibold">Date</th>
            <th className="w-28 py-2 text-right font-semibold">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {r.items.map((it, i) => {
            const known = !it.property || addresses.includes(it.property);
            return (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pr-2">
                  <select
                    aria-label={`Property ${i + 1}`}
                    className={input}
                    value={it.property}
                    onChange={(e) => setItem(i, { property: e.target.value })}
                  >
                    <option value="">— choose a property —</option>
                    {addresses.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                    {!known && <option value={it.property}>{it.property}</option>}
                  </select>
                  {!known && <div className="mt-0.5 text-xs text-amber-600">no longer in the programme</div>}
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    aria-label={`Date ${i + 1}`}
                    className={input}
                    type="date"
                    value={String(it.at || "").slice(0, 10)}
                    onChange={(e) => setItem(i, { at: e.target.value })}
                  />
                </td>
                <td className="py-1.5">
                  <input
                    aria-label={`Amount ${i + 1}`}
                    className={`${input} text-right`}
                    inputMode="decimal"
                    value={String(it.amount ?? "")}
                    onChange={(e) => setItem(i, { amount: e.target.value })}
                  />
                </td>
                <td className="py-1.5 text-center">
                  <button
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => set("items", r.items.filter((_, j) => j !== i))}
                    className="px-1 text-lg leading-none text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {addresses.length === 0 && (
        <p className="mt-2 text-xs text-amber-700">No properties in the programme yet — add them on the Properties tab.</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => set("items", [...r.items, { property: "", at: "", amount: "" }])}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          + Add inspection
        </button>
        <div className="text-sm">
          <span className="mr-3 text-slate-500">Total paid</span>
          <span className="font-semibold tabular-nums text-slate-800">{formatCurrencyCents(receiptTotal(r.items))}</span>
        </div>
      </div>

      <label className="mt-5 block text-xs text-slate-500">
        Notes
        <textarea className={input} rows={2} value={r.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth recording about this payment" />
      </label>
    </div>
  );
}
