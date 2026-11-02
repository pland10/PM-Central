"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_PARTIES, partyOf } from "@/config/invoicing-parties";
import { FREQUENCIES } from "@/lib/billing";
import type { CustomerRecord } from "@/lib/billing-db";
import { formatCurrencyCents } from "@/lib/format";

type Draft = Omit<CustomerRecord, "id" | "rate"> & { id?: string; rate: string };

const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label]));
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Draft => ({
  billingParty: "pmi",
  name: "",
  addr: "",
  contact: "",
  attn: "",
  service: "",
  rate: "",
  frequency: "monthly",
  startDate: today(),
  isActive: true,
  rentvinePortfolioId: null,
  rentvineContactId: null,
  notes: "",
});
const toDraft = (c: CustomerRecord): Draft => ({ ...c, rate: String(c.rate) });

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function CustomersView({
  customers,
  invoiceCounts,
}: {
  customers: CustomerRecord[];
  invoiceCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(editing.id ? `/api/invoicing/customers/${editing.id}` : "/api/invoicing/customers", {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: CustomerRecord) {
    const n = invoiceCounts[c.id] ?? 0;
    const msg = n
      ? `Delete ${c.name}? Their ${n} invoice(s) are kept exactly as they are — only the customer record goes.`
      : `Delete ${c.name}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/invoicing/customers/${c.id}`, { method: "DELETE" });
    if (!res.ok) setError("Could not delete the customer.");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Customers</h1>
          <p className="text-sm text-slate-500">The agreed rate and how often each customer is billed.</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(blank())}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New customer
          </button>
        )}
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {editing && (
        <form
          aria-label="Customer"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          <label className="text-xs text-slate-500">
            Customer name
            <input className={input} value={editing.name} onChange={(e) => set("name", e.target.value)} placeholder="Who is being billed" />
          </label>
          <label className="text-xs text-slate-500">
            Invoiced by
            <select className={input} value={editing.billingParty} onChange={(e) => set("billingParty", e.target.value)}>
              {Object.values(BILLING_PARTIES).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Address
            <textarea className={input} rows={2} value={editing.addr ?? ""} onChange={(e) => set("addr", e.target.value)} placeholder="Street, city, state ZIP" />
          </label>
          <label className="text-xs text-slate-500">
            Phone / email
            <input className={input} value={editing.contact ?? ""} onChange={(e) => set("contact", e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            Attention
            <input className={input} value={editing.attn ?? ""} onChange={(e) => set("attn", e.target.value)} placeholder="Attn: …" />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Service (becomes the invoice line)
            <input className={input} value={editing.service ?? ""} onChange={(e) => set("service", e.target.value)} placeholder="e.g. Squatter watch — weekly inspection" />
          </label>
          <label className="text-xs text-slate-500">
            Rate per period
            <input className={input} inputMode="decimal" value={editing.rate} onChange={(e) => set("rate", e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            Billed
            <select className={input} value={editing.frequency} onChange={(e) => set("frequency", e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            First billing period
            <input className={input} type="date" value={editing.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            Active
            <select className={input} value={editing.isActive ? "yes" : "no"} onChange={(e) => set("isActive", e.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Notes
            <input className={input} value={editing.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering about this arrangement" />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Saving…" : editing.id ? "Save changes" : "Add customer"}
            </button>
          </div>
        </form>
      )}

      {customers.length === 0 && !editing ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No customers yet. A customer records the agreed rate and how often they are billed, so invoices stop being rebuilt from memory.
        </div>
      ) : customers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">From</th>
                <th className="px-4 py-2.5 font-semibold">Service</th>
                <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
                <th className="px-4 py-2.5 font-semibold">Frequency</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{c.name}</div>
                    {c.attn && <div className="text-xs text-slate-400">{c.attn}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{partyOf(c.billingParty).short}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.service}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyCents(c.rate)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{FREQ_LABEL[c.frequency] ?? c.frequency}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button onClick={() => setEditing(toDraft(c))} className="mr-3 text-xs font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(c)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
