"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";

export type SwRow = {
  id: string;
  title: string;
  address: string;
  owner: string;
  type: string;
  source: string;
  workOrders: number;
};

export function SquatterWatchTable({ rows }: { rows: SwRow[] }) {
  const typeOptions = Array.from(new Set(rows.map((r) => r.type)))
    .sort()
    .map((t) => ({ value: t, label: t.replace("-", " ") }));
  const sourceOptions = Array.from(new Set(rows.map((r) => r.source)))
    .sort()
    .map((s) => ({ value: s, label: s }));

  const columns: Column<SwRow>[] = [
    {
      key: "title",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.title.toLowerCase(),
      filter: { type: "text", value: (r) => `${r.title} ${r.address}` },
      render: (r) => (
        <>
          <Link
            href={`/properties/${r.id}`}
            className="font-medium text-slate-900 hover:text-brand-600"
          >
            {r.title}
          </Link>
          <div className="text-xs text-slate-500">{r.address}</div>
        </>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortable: true,
      sortValue: (r) => r.owner.toLowerCase(),
      filter: { type: "text", value: (r) => r.owner },
      render: (r) => <span className="text-slate-600">{r.owner}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (r) => r.type,
      filter: { type: "select", value: (r) => r.type, options: typeOptions },
      render: (r) => <span className="capitalize text-slate-600">{r.type.replace("-", " ")}</span>,
    },
    {
      key: "workOrders",
      header: "Work orders",
      align: "right",
      sortable: true,
      sortValue: (r) => r.workOrders,
      render: (r) => <span className="text-slate-600">{r.workOrders}</span>,
    },
    {
      key: "source",
      header: "Source",
      sortable: true,
      sortValue: (r) => r.source,
      filter: { type: "select", value: (r) => r.source, options: sourceOptions },
      render: (r) => (
        <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-emerald-700">
          {r.source}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.title} ${r.address} ${r.owner}`}
      searchPlaceholder="Search address or owner…"
      initialSort={{ key: "title", dir: "asc" }}
    />
  );
}
