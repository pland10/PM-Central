"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type InvoiceRow,
  type InvoiceStatus,
  type InvoiceParty,
  invoiceTotals,
  lineAmount,
  formatMoney,
} from "@/lib/invoices";

type ItemDraft = { desc: string; qty: string; rate: string };

function partyToDraft(p: InvoiceParty | null): { name: string; addr: string; contact: string; extra: string } {
  return { name: p?.name ?? "", addr: p?.addr ?? "", contact: p?.contact ?? "", extra: p?.extra ?? "" };
}

export function InvoiceEditor({ initial }: { initial: InvoiceRow }) {
  const router = useRouter();

  const [status, setStatus] = useState<InvoiceStatus>(initial.status);
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? "");
  const [dueDate, setDueDate] = useState(initial.due_date ?? "");
  const [period, setPeriod] = useState(initial.period ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [billingContact, setBillingContact] = useState(initial.billing_contact ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [taxRate, setTaxRate] = useState(String(Number(initial.tax_rate) || 0));
  const [billTo, setBillTo] = useState(partyToDraft(initial.bill_to));
  const [items, setItems] = useState<ItemDraft[]>(
    (initial.items && initial.items.length ? initial.items : [{ desc: "", qty: 1, rate: "" }]).map((it) => ({
      desc: String(it.desc ?? ""),
      qty: String(it.qty ?? ""),
      rate: String(it.rate ?? ""),
    }))
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const itemsForTotals = items.map((it) => ({ qty: it.qty, rate: it.rate }));
  const totals = invoiceTotals(itemsForTotals, taxRate);

  const from = initial.from_party;

  async function save(next?: Partial<{ status: InvoiceStatus }>) {
    setSaving(true);
    setSaved(false);
    setError("");
    const payload = {
      invoice_date: invoiceDate || null,
      due_date: dueDate || null,
      period: period || null,
      bill_to: billTo,
      terms: terms || null,
      notes: notes || null,
      billing_contact: billingContact || null,
      tax_rate: Number(taxRate) || 0,
      status: next?.status ?? status,
      items: items.map((it) => ({
        desc: it.desc,
        qty: Number(it.qty) || 0,
        rate: Number(it.rate) || 0,
      })),
    };
    const res = await fetch(`/api/invoices/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      setSaving(false);
      return false;
    }
    setSaving(false);
    setSaved(true);
    router.refresh();
    return true;
  }

  async function setStatusAndSave(s: InvoiceStatus) {
    setStatus(s);
    await save({ status: s });
  }

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-ink">{initial.number}</h1>
            <StatusPill status={status} />
          </div>
          <p className="text-sm text-slate-500">From {from?.name || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/invoice-print/${initial.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print / PDF
          </a>
          <button
            onClick={() => save()}
            disabled={saving}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && !error && <div className="mb-3 text-sm text-emerald-600">Saved.</div>}

      {/* Status quick-set */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-slate-500">Status:</span>
        {(["draft", "sent", "paid"] as InvoiceStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusAndSave(s)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
              status === s ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Bill to + dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Bill to">
          <Field label="Name">
            <input className={inputCls} value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} />
          </Field>
          <Field label="Address">
            <textarea className={inputCls} rows={2} value={billTo.addr} onChange={(e) => setBillTo({ ...billTo, addr: e.target.value })} />
          </Field>
          <Field label="Contact">
            <input className={inputCls} value={billTo.contact} onChange={(e) => setBillTo({ ...billTo, contact: e.target.value })} />
          </Field>
          <Field label="Attn / extra">
            <input className={inputCls} value={billTo.extra} onChange={(e) => setBillTo({ ...billTo, extra: e.target.value })} />
          </Field>
        </Section>

        <Section title="Details">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice date">
              <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            <Field label="Due date">
              <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Period">
              <input className={inputCls} placeholder="e.g. Sept 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
            <Field label="Terms">
              <input className={inputCls} placeholder="Net 30" value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
            <Field label="Tax rate (%)">
              <input className={inputCls} inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </Field>
            <Field label="Billing contact">
              <input className={inputCls} value={billingContact} onChange={(e) => setBillingContact(e.target.value)} />
            </Field>
          </div>
        </Section>
      </div>

      {/* Line items */}
      <Section title="Line items" className="mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 font-medium">Description</th>
              <th className="w-20 pb-2 text-right font-medium">Qty</th>
              <th className="w-28 pb-2 text-right font-medium">Rate</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2">
                  <input className={inputCls} value={it.desc} onChange={(e) => updateItem(i, { desc: e.target.value })} />
                </td>
                <td className="py-1.5">
                  <input className={`${inputCls} text-right`} inputMode="decimal" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} />
                </td>
                <td className="py-1.5">
                  <input className={`${inputCls} text-right`} inputMode="decimal" value={it.rate} onChange={(e) => updateItem(i, { rate: e.target.value })} />
                </td>
                <td className="py-1.5 text-right font-medium text-ink">
                  {formatMoney(lineAmount({ qty: it.qty, rate: it.rate }))}
                </td>
                <td className="py-1.5 text-right">
                  <button onClick={() => removeItem(i)} className="px-1 text-slate-400 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => setItems([...items, { desc: "", qty: "1", rate: "" }])}
          className="mt-2 text-sm font-medium text-brand-600 hover:underline"
        >
          + Add line
        </button>

        <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
          <Row label={`Tax (${Number(taxRate) || 0}%)`} value={formatMoney(totals.tax)} />
          <div className="mt-1 border-t border-slate-200 pt-1">
            <Row label="Total" value={formatMoney(totals.total)} bold />
          </div>
        </div>
      </Section>

      <Section title="Notes" className="mt-4">
        <textarea className={inputCls} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Section>
    </div>
  );

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeItem(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500";

function StatusPill({ status }: { status: InvoiceStatus }) {
  const styles: Record<InvoiceStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    sent: "bg-amber-100 text-amber-700",
    paid: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${styles[status]}`}>{status}</span>;
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-ink" : "text-slate-500"}>{label}</span>
      <span className={bold ? "font-semibold text-ink" : "text-slate-700"}>{value}</span>
    </div>
  );
}
