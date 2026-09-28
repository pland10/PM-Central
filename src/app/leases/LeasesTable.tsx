"use client";

import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";

export type LeaseRow = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  unit: string;
  tenant: string;
  rent: number;
  startISO: string | null;
  endISO: string | null;
  status: string;
};

function fmtMonth(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    ended: "bg-slate-100 text-slate-600",
    eviction: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export function LeasesTable({ rows }: { rows: LeaseRow[] }) {
  const columns: Column<LeaseRow>[] = [
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.propertyAddress.toLowerCase(),
      render: (r) => (
        <Link href={`/properties/${r.propertyId}`} className="font-medium text-slate-900 hover:text-brand-600">
          {r.propertyAddress}
        </Link>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (r) => <span className="text-slate-600">{r.unit}</span>,
    },
    {
      key: "tenant",
      header: "Tenant",
      sortable: true,
      sortValue: (r) => r.tenant.toLowerCase(),
      render: (r) => <span className="text-slate-700">{r.tenant}</span>,
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      sortable: true,
      sortValue: (r) => r.rent,
      render: (r) => <span className="text-slate-700">{formatCurrency(r.rent)}</span>,
    },
    {
      key: "term",
      header: "Term",
      sortable: true,
      sortValue: (r) => r.endISO ?? "",
      render: (r) => (
        <span className="text-slate-600">
          {fmtMonth(r.startISO)} – {fmtMonth(r.endISO)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => statusBadge(r.status),
    },
  ];

  const statusOptions = Array.from(new Set(rows.map((r) => r.status)))
    .sort()
    .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  const facets: Facet<LeaseRow>[] = [
    {
      key: "status",
      label: "Status",
      options: statusOptions,
      match: (r, v) => r.status === v,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.propertyAddress} ${r.tenant}`}
      searchPlaceholder="Search property or tenant…"
      facets={facets}
      initialSort={{ key: "term", dir: "desc" }}
    />
  );
}
