import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { partyOf } from "@/config/invoicing-parties";
import { loadReceipt } from "@/lib/receipts-db";
import { receiptTotal } from "@/lib/receipts";
import { formatDate, formatMoney } from "@/lib/invoices";
import { PrintToolbar } from "../../invoice-print/[id]/PrintToolbar";

// Standalone, print-styled inspector receipt (no app chrome). Opened in a new
// tab from the receipt editor; the Print button saves it as PDF.
export const dynamic = "force-dynamic";

export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("invoicing");
  const { id } = await params;
  const r = await loadReceipt(id);
  if (!r) notFound();
  const party = partyOf(r.billingParty);
  const items = r.items.filter((it) => it.property || it.amount);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 0.6in; } @media print { .no-print { display: none !important; } }`}</style>
      <PrintToolbar number={r.number} kind="Receipt" />

      <div className="mx-auto max-w-[8.5in] bg-white p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="mb-8 flex items-start justify-between gap-8">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={party.logoSrc} alt={party.label} style={{ width: party.logoWidth }} className="mb-3" />
            <div className="whitespace-pre-line text-xs text-slate-600">
              <div className="font-semibold text-slate-800">{party.from.name}</div>
              {party.from.addr}
              {party.from.contact && <div>{party.from.contact}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-slate-800">RECEIPT</div>
            <div className="mt-1 font-mono text-sm text-slate-600">{r.number}</div>
            <div className="mt-3 text-xs text-slate-600">
              <div>Paid: {formatDate(r.paidOn)}</div>
              {r.method && <div>Method: {r.method}</div>}
              {r.reference && <div>Reference: {r.reference}</div>}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Paid to</div>
          <div className="text-sm font-medium text-slate-800">{r.inspector || "—"}</div>
        </div>
        <p className="mb-4 text-sm text-slate-500">Received with thanks, for the inspections below.</p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Property inspected</th>
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 text-slate-800">{it.property}</td>
                <td className="py-2 text-slate-600">{formatDate(String(it.at || "").slice(0, 10))}</td>
                <td className="py-2 text-right font-medium text-slate-800">{formatMoney(Number(it.amount) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="flex w-64 justify-between border-t-2 border-slate-300 pt-2 text-base font-semibold text-slate-900">
            <span>Total paid</span>
            <span>{formatMoney(receiptTotal(r.items))}</span>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-10 text-xs text-slate-600">
          <div className="whitespace-pre-line">{r.notes}</div>
          <div>
            <div className="mb-8 font-semibold uppercase tracking-wide text-slate-400">Signature</div>
            <div className="border-b border-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
