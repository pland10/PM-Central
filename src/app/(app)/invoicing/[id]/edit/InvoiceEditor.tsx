"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type InvoiceRow,
  type InvoiceStatus,
  type InvoiceParty,
  invoiceTotals,
  lineAmount,
  formatMoney,
} from "@/lib/invoices";
import { partyOf } from "@/config/invoicing-parties";
import type { PropertyOption } from "@/lib/property-options";

type ItemDraft = { desc: string; qty: string; rate: string };

function partyToDraft(p: InvoiceParty | null) {
  return { name: p?.name ?? "", addr: p?.addr ?? "", contact: p?.contact ?? "", extra: p?.extra ?? "" };
}

// Inline, borderless field that reads as part of the invoice but highlights on
// hover/focus so people know it's editable.
const field =
  "bg-transparent outline-none rounded px-1 -mx-1 hover:bg-slate-100 focus:bg-brand-50 focus:ring-1 focus:ring-brand-200 transition-colors";

export function InvoiceEditor({
  initial,
  properties,
}: {
  initial: InvoiceRow;
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const party = partyOf(initial.billing_party);
  const from = initial.from_party ?? party.from;

  const [status, setStatus] = useState<InvoiceStatus>(initial.status);
  const [propertyExternalId, setPropertyExternalId] = useState(initial.property_external_id ?? "");
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

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const totals = invoiceTotals(items.map((it) => ({ qty: it.qty, rate: it.rate })), taxRate);

  async function save() {
    setSaveState("saving");
    setErrorMsg("");
    const payload = {
      invoice_date: invoiceDate || null,
      due_date: dueDate || null,
      period: period || null,
      bill_to: billTo,
      terms: terms || null,
      notes: notes || null,
      billing_contact: billingContact || null,
      tax_rate: Number(taxRate) || 0,
      status,
      property_external_id: propertyExternalId || null,
      items: items.map((it) => ({ desc: it.desc, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0 })),
    };
    const res = await fetch(`/api/invoices/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setErrorMsg((await res.json().catch(() => ({}))).error || "Save failed.");
      setSaveState("error");
      return;
    }
    setSaveState("saved");
  }

  // Auto-save ~1s after the last edit (debounced), skipping the initial mount.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(save, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, invoiceDate, dueDate, period, terms, billingContact, notes, taxRate, billTo, items, propertyExternalId]);

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function discard() {
    if (!confirm(`Discard invoice ${initial.number}? It will be removed and its number freed.`)) return;
    const res = await fetch(`/api/invoices/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      setErrorMsg((await res.json().catch(() => ({}))).error || "Could not discard.");
      setSaveState("error");
      return;
    }
    router.push("/invoicing");
    router.refresh();
  }

  return (
    <div className="mt-2">
      {/* Toolbar (not part of the sheet) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Status:</span>
          {(["draft", "sent", "paid"] as InvoiceStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                status === s
                  ? "bg-brand-600 text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s}
            </button>
          ))}
          <span className="ml-2 text-xs text-slate-400">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "✓ Saved"}
            {saveState === "error" && <span className="text-red-600">{errorMsg}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "draft" && (
            <button
              onClick={discard}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Discard
            </button>
          )}
          <a
            href={`/invoice-print/${initial.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print / PDF
          </a>
        </div>
      </div>

      {/* The invoice sheet */}
      <div className="mx-auto max-w-[8.5in] rounded-lg border border-slate-200 bg-white p-10 shadow-sm">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-8">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={party.logoSrc} alt={party.label} style={{ width: party.logoWidth }} className="mb-3" />
            <div className="whitespace-pre-line text-xs text-slate-600">
              <div className="font-semibold text-slate-800">{from.name}</div>
              {from.addr}
              {from.contact && <div>{from.contact}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-slate-700">INVOICE</div>
            <table className="ml-auto mt-3 text-sm">
              <tbody>
                <tr>
                  <td className="pr-3 text-right text-slate-500">Invoice #</td>
                  <td className="text-right font-mono font-medium text-slate-800">{initial.number}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-right text-slate-500">Date</td>
                  <td className="text-right">
                    <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${field} text-right`} />
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-right text-slate-500">Due</td>
                  <td className="text-right">
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${field} text-right`} />
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-right text-slate-500">Terms</td>
                  <td className="text-right">
                    <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Net 30" className={`${field} w-24 text-right`} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* From / Bill to */}
        <div className="mb-6 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-1 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">From</div>
            <div className="whitespace-pre-line text-sm text-slate-700">
              <div className="font-medium text-slate-800">{from.name}</div>
              {from.addr}
              {from.contact && <div>{from.contact}</div>}
            </div>
          </div>
          <div>
            <div className="mb-1 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Bill to</div>
            <input value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} placeholder="Customer name" className={`${field} block w-full font-medium text-slate-800`} />
            <textarea value={billTo.addr} onChange={(e) => setBillTo({ ...billTo, addr: e.target.value })} placeholder="Address" rows={2} className={`${field} block w-full resize-none text-sm text-slate-700`} />
            <input value={billTo.contact} onChange={(e) => setBillTo({ ...billTo, contact: e.target.value })} placeholder="Contact" className={`${field} block w-full text-sm text-slate-700`} />
            <input value={billTo.extra} onChange={(e) => setBillTo({ ...billTo, extra: e.target.value })} placeholder="Attn: …" className={`${field} block w-full text-sm text-slate-700`} />
          </div>
        </div>

        {/* Property this invoice is about */}
        <div className="mb-4 flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Property
          </span>
          <select
            value={propertyExternalId}
            onChange={(e) => setPropertyExternalId(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="">— Not linked to a property —</option>
            {propertyExternalId &&
              !properties.some((p) => p.externalId === propertyExternalId) && (
                <option value={propertyExternalId}>(linked property)</option>
              )}
            {properties.map((p) => (
              <option key={p.externalId} value={p.externalId}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Period / reference */}
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="Service period or reference — e.g. Maintenance services, August 2026"
          className={`${field} mb-4 block w-full text-sm text-slate-500`}
        />

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Description</th>
              <th className="w-24 py-2 text-right font-medium">Qty / hrs</th>
              <th className="w-28 py-2 text-right font-medium">Rate</th>
              <th className="w-28 py-2 text-right font-medium">Amount</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1">
                  <input value={it.desc} onChange={(e) => updateItem(i, { desc: e.target.value })} placeholder="Describe the work performed" className={`${field} w-full`} />
                </td>
                <td className="py-1">
                  <input value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} inputMode="decimal" className={`${field} w-full text-right`} />
                </td>
                <td className="py-1">
                  <input value={it.rate} onChange={(e) => updateItem(i, { rate: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${field} w-full text-right`} />
                </td>
                <td className="py-1 text-right font-medium text-slate-800">{formatMoney(lineAmount({ qty: it.qty, rate: it.rate }))}</td>
                <td className="py-1 text-right">
                  <button onClick={() => setItems((a) => a.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => setItems([...items, { desc: "", qty: "1", rate: "" }])}
          className="mt-2 rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          + Add line
        </button>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <table className="w-64 text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-slate-500">Subtotal</td>
                <td className="py-1 text-right text-slate-700">{formatMoney(totals.subtotal)}</td>
              </tr>
              <tr>
                <td className="py-1 text-slate-500">
                  Tax <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" className={`${field} w-12 text-right`} /> %
                </td>
                <td className="py-1 text-right text-slate-700">{formatMoney(totals.tax)}</td>
              </tr>
              <tr className="border-t-2 border-slate-300">
                <td className="py-2 text-base font-semibold text-slate-900">Total due</td>
                <td className="py-2 text-right text-base font-semibold text-slate-900">{formatMoney(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes + billing questions */}
        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-slate-200 pt-4">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes / payment</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} className={`${field} block w-full resize-y whitespace-pre-line text-sm text-slate-700`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Billing questions</div>
            <input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} placeholder="Who to contact about this invoice" className={`${field} block w-full text-sm text-slate-700`} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Click any field on the invoice to edit it — changes save as you type. For a PDF, press{" "}
        <span className="font-medium">Print / PDF</span> and choose “Save as PDF”.
      </p>
    </div>
  );
}
