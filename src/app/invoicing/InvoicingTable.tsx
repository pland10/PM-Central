"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import {
  type InvoiceRow,
  type InvoiceStatus,
  invoiceTotals,
  lineAmount,
  formatMoney,
  formatDate,
} from "@/lib/invoices";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function billToName(r: InvoiceRow): string {
  return r.bill_to?.name?.trim() || "—";
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function InvoicingTable({ rows }: { rows: InvoiceRow[] }) {
  const [selected, setSelected] = useState<InvoiceRow | null>(null);

  // KPIs computed across the full set (not the filtered page).
  const kpis = useMemo(() => {
    const acc = {
      count: rows.length,
      outstanding: 0, // total of 'sent' (issued, not yet paid)
      paid: 0,
      draftCount: 0,
      sentCount: 0,
      paidCount: 0,
    };
    for (const r of rows) {
      const { total } = invoiceTotals(r.items, r.tax_rate);
      if (r.status === "draft") acc.draftCount++;
      else if (r.status === "sent") {
        acc.sentCount++;
        acc.outstanding += total;
      } else if (r.status === "paid") {
        acc.paidCount++;
        acc.paid += total;
      }
    }
    return acc;
  }, [rows]);

  const columns: Column<InvoiceRow>[] = [
    {
      key: "number",
      header: "Invoice #",
      sortable: true,
      sortValue: (r) => r.number.toLowerCase(),
      render: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs text-brand-600 hover:underline"
        >
          {r.number}
        </button>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      sortValue: (r) => r.invoice_date ?? "",
      render: (r) => <span className="text-slate-600">{formatDate(r.invoice_date)}</span>,
    },
    {
      key: "billTo",
      header: "Billed to",
      sortable: true,
      sortValue: (r) => billToName(r).toLowerCase(),
      render: (r) => <span className="text-slate-800">{billToName(r)}</span>,
    },
    {
      key: "period",
      header: "Period",
      sortable: true,
      sortValue: (r) => r.period ?? "",
      render: (r) => <span className="text-slate-500">{r.period || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      sortValue: (r) => r.due_date ?? "",
      render: (r) => <span className="text-slate-600">{formatDate(r.due_date)}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortValue: (r) => invoiceTotals(r.items, r.tax_rate).total,
      render: (r) => (
        <span className="font-medium text-ink">
          {formatMoney(invoiceTotals(r.items, r.tax_rate).total)}
        </span>
      ),
    },
  ];

  const facets: Facet<InvoiceRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "draft", label: "Draft" },
        { value: "sent", label: "Sent" },
        { value: "paid", label: "Paid" },
      ],
      match: (r, v) => r.status === v,
    },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Invoices" value={String(kpis.count)} sub={`${kpis.draftCount} draft`} />
        <Kpi
          label="Outstanding"
          value={formatMoney(kpis.outstanding)}
          sub={`${kpis.sentCount} sent`}
        />
        <Kpi label="Paid" value={formatMoney(kpis.paid)} sub={`${kpis.paidCount} paid`} />
        <Kpi
          label="Collected rate"
          value={
            kpis.paid + kpis.outstanding > 0
              ? `${Math.round((kpis.paid / (kpis.paid + kpis.outstanding)) * 100)}%`
              : "—"
          }
          sub="paid of billed"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        search={(r) => `${r.number} ${billToName(r)} ${r.period ?? ""}`}
        searchPlaceholder="Search number, customer, period…"
        facets={facets}
        initialSort={{ key: "date", dir: "desc" }}
      />

      {selected && <InvoiceDrawer invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function InvoiceDrawer({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const totals = invoiceTotals(invoice.items, invoice.tax_rate);
  const items = invoice.items ?? [];
  const from = invoice.from_party;
  const billTo = invoice.bill_to;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-sm font-semibold text-ink">{invoice.number}</h2>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDate(invoice.invoice_date)}
              {invoice.due_date && ` · due ${formatDate(invoice.due_date)}`}
              {invoice.period && ` · ${invoice.period}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-slate-200 p-5 text-sm">
          <Party title="From" party={from} />
          <Party title="Bill to" party={billTo} />
        </div>

        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-400">
                    No line items.
                  </td>
                </tr>
              )}
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-800">{it.desc || "—"}</td>
                  <td className="py-2 text-right text-slate-600">{Number(it.qty) || 0}</td>
                  <td className="py-2 text-right text-slate-600">
                    {formatMoney(Number(it.rate) || 0)}
                  </td>
                  <td className="py-2 text-right font-medium text-ink">
                    {formatMoney(lineAmount(it))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
            <Row label={`Tax (${Number(invoice.tax_rate) || 0}%)`} value={formatMoney(totals.tax)} />
            <div className="mt-1 border-t border-slate-200 pt-1">
              <Row label="Total" value={formatMoney(totals.total)} bold />
            </div>
          </div>

          {(invoice.terms || invoice.notes || invoice.billing_contact) && (
            <div className="mt-6 space-y-3 border-t border-slate-200 pt-4 text-sm">
              {invoice.billing_contact && (
                <Field label="Billing contact" value={invoice.billing_contact} />
              )}
              {invoice.terms && <Field label="Terms" value={invoice.terms} />}
              {invoice.notes && <Field label="Notes" value={invoice.notes} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Party({ title, party }: { title: string; party: InvoiceRow["from_party"] }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="font-medium text-ink">{party?.name || "—"}</div>
      {party?.addr && <div className="whitespace-pre-line text-slate-600">{party.addr}</div>}
      {party?.contact && <div className="text-slate-600">{party.contact}</div>}
      {party?.extra && <div className="text-slate-500">{party.extra}</div>}
    </div>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="whitespace-pre-line text-slate-700">{value}</div>
    </div>
  );
}
