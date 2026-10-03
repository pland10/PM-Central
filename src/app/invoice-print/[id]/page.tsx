import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import { partyOf } from "@/config/invoicing-parties";
import { type InvoiceRow, invoiceTotals, lineAmount, formatMoney, formatDate } from "@/lib/invoices";
import { PrintToolbar } from "./PrintToolbar";

// Standalone, print-styled invoice sheet (no app chrome). Opened in a new tab
// from the editor; Ctrl/Cmd-P or the Print button saves it as PDF.
export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("invoicing");
  const { id } = await params;
  const db = getInvoicingSupabase();
  if (!db) notFound();

  const { data, error } = await db
    .from("invoices")
    .select(
      "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,billing_party"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const inv = data as InvoiceRow;
  const party = partyOf(inv.billing_party);
  const from = inv.from_party ?? party.from;
  const billTo = inv.bill_to;
  const items = inv.items ?? [];
  const totals = invoiceTotals(items, inv.tax_rate);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 0.6in; } @media print { .no-print { display: none !important; } }`}</style>

      <PrintToolbar number={inv.number} />

      <div className="mx-auto max-w-[8.5in] bg-white p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-8">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={party.logoSrc} alt={party.label} style={{ width: party.logoWidth }} className="mb-3" />
            <div className="whitespace-pre-line text-xs text-slate-600">
              <div className="font-semibold text-slate-800">{from?.name}</div>
              {from?.addr}
              {from?.contact && <div>{from.contact}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-slate-800">INVOICE</div>
            <div className="mt-1 font-mono text-sm text-slate-600">{inv.number}</div>
            <div className="mt-3 text-xs text-slate-600">
              <div>Date: {formatDate(inv.invoice_date)}</div>
              {inv.due_date && <div>Due: {formatDate(inv.due_date)}</div>}
              {inv.period && <div>Period: {inv.period}</div>}
              {inv.terms && <div>Terms: {inv.terms}</div>}
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="mb-8">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Bill to</div>
          <div className="whitespace-pre-line text-sm text-slate-700">
            <div className="font-medium text-slate-800">{billTo?.name}</div>
            {billTo?.addr}
            {billTo?.contact && <div>{billTo.contact}</div>}
            {billTo?.extra && <div>{billTo.extra}</div>}
          </div>
          {inv.billing_contact && (
            <div className="mt-1 text-xs text-slate-500">Attn: {inv.billing_contact}</div>
          )}
        </div>

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 text-slate-800">{it.desc || ""}</td>
                <td className="py-2 text-right text-slate-600">{Number(it.qty) || 0}</td>
                <td className="py-2 text-right text-slate-600">{formatMoney(Number(it.rate) || 0)}</td>
                <td className="py-2 text-right font-medium text-slate-800">{formatMoney(lineAmount(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700">{formatMoney(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tax ({Number(inv.tax_rate) || 0}%)</span>
              <span className="text-slate-700">{formatMoney(totals.tax)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-slate-300 pt-2 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(totals.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="mt-10 whitespace-pre-line border-t border-slate-200 pt-4 text-xs text-slate-600">
            {inv.notes}
          </div>
        )}
      </div>
    </div>
  );
}
