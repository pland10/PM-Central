"use client";

import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";

export type WorkOrderRow = {
  id: string;
  number: string;
  issue: string;
  propertyId: string;
  propertyAddress: string;
  priority: string;
};

const PRIORITY_RANK: Record<string, number> = { emergency: 4, high: 3, normal: 2, low: 1 };

function priorityBadge(priority: string) {
  const styles: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-amber-100 text-amber-700",
    emergency: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[priority] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {priority}
    </span>
  );
}

export function WorkOrdersTable({ rows }: { rows: WorkOrderRow[] }) {
  const columns: Column<WorkOrderRow>[] = [
    {
      key: "number",
      header: "#",
      sortable: true,
      sortValue: (r) => Number(r.number) || 0,
      render: (r) => <span className="font-mono text-xs text-slate-400">{r.number}</span>,
    },
    {
      key: "issue",
      header: "Issue",
      sortable: true,
      sortValue: (r) => r.issue.toLowerCase(),
      render: (r) => <span className="text-slate-800">{r.issue}</span>,
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.propertyAddress.toLowerCase(),
      render: (r) => (
        <Link href={`/properties/${r.propertyId}`} className="text-slate-600 hover:text-brand-600">
          {r.propertyAddress}
        </Link>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      sortValue: (r) => PRIORITY_RANK[r.priority] ?? 0,
      render: (r) => priorityBadge(r.priority),
    },
  ];

  const priorityOptions = Array.from(new Set(rows.map((r) => r.priority)))
    .sort((a, b) => (PRIORITY_RANK[b] ?? 0) - (PRIORITY_RANK[a] ?? 0))
    .map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }));

  const facets: Facet<WorkOrderRow>[] = [
    {
      key: "priority",
      label: "Priority",
      options: priorityOptions,
      match: (r, v) => r.priority === v,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.issue} ${r.propertyAddress}`}
      searchPlaceholder="Search issue or property…"
      facets={facets}
    />
  );
}
