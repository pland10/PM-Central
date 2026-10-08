"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";

export type TenantRow = {
  id: string;
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  propertyId: string;
  propertyAddress: string;
  startISO: string | null;
  endISO: string | null;
  status: string;
};

function fmtMonth(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function TenantsTable({ rows }: { rows: TenantRow[] }) {
  const statusOptions = Array.from(new Set(rows.map((r) => r.status)))
    .sort()
    .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  const columns: Column<TenantRow>[] = [
    {
      key: "name",
      header: "Tenant",
      sortable: true,
      sortValue: (r) => r.name.toLowerCase(),
      filter: { type: "text", value: (r) => r.name },
      render: (r) => (
        <Link href={`/tenants/${r.contactId}`} className="font-medium text-slate-900 hover:text-brand-600">
          {r.name}
        </Link>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      filter: { type: "text", value: (r) => `${r.email ?? ""} ${r.phone ?? ""}` },
      render: (r) => (
        <>
          {r.email && (
            <a href={`mailto:${r.email}`} className="block text-brand-600 hover:underline">
              {r.email}
            </a>
          )}
          {r.phone && <span className="text-slate-500">{r.phone}</span>}
          {!r.email && !r.phone && <span className="text-slate-400">—</span>}
        </>
      ),
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.propertyAddress.toLowerCase(),
      filter: { type: "text", value: (r) => r.propertyAddress },
      render: (r) => (
        <Link href={`/properties/${r.propertyId}`} className="text-slate-700 hover:text-brand-600">
          {r.propertyAddress}
        </Link>
      ),
    },
    {
      key: "term",
      header: "Lease term",
      sortable: true,
      sortValue: (r) => r.endISO ?? "",
      filter: { type: "date", value: (r) => r.endISO },
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
      filter: { type: "select", value: (r) => r.status, options: statusOptions },
      render: (r) => (
        <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-emerald-700">
          {r.status}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.propertyAddress}`}
      searchPlaceholder="Search tenant, email, phone, address…"
      initialSort={{ key: "name", dir: "asc" }}
    />
  );
}
