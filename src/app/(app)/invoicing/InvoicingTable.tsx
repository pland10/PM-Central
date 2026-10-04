"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import {
  type InvoiceRow,
  type InvoiceStatus,
  invoiceTotals,
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

function propertyName(r: InvoiceRow, labels: Record<string, string>): string {
  if (!r.property_external_id) return "";
  return labels[r.property_external_id] || "Linked property";
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

export function InvoicingTable({
  rows,
  propertyLabels = {},
}: {
  rows: InvoiceRow[];
  propertyLabels?: Record<string, string>;
}) {
  const kpis = useMemo(() => {
    const acc = { count: rows.length, outstanding: 0, paid: 0, draftCount: 0, sentCount: 0, paidCount: 0 };
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
        <Link href={`/invoicing/${r.id}/edit`} className="font-mono text-xs text-brand-600 hover:underline">
          {r.number}
        </Link>
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
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => propertyName(r, propertyLabels).toLowerCase(),
      render: (r) => {
        const name = propertyName(r, propertyLabels);
        return name ? (
          <span className="text-slate-700">{name}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
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
        <span className="font-medium text-ink">{formatMoney(invoiceTotals(r.items, r.tax_rate).total)}</span>
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
        <Kpi label="Outstanding" value={formatMoney(kpis.outstanding)} sub={`${kpis.sentCount} sent`} />
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
        search={(r) => `${r.number} ${billToName(r)} ${propertyName(r, propertyLabels)} ${r.period ?? ""}`}
        searchPlaceholder="Search number, customer, property, period…"
        facets={facets}
        initialSort={{ key: "date", dir: "desc" }}
      />
    </div>
  );
}
