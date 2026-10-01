"use client";

import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import {
  type InspectionRow,
  statusTone,
  formatInspectionDate,
} from "@/lib/inspections/types";

const TONE_STYLES: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  bad: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        TONE_STYLES[statusTone(status)]
      }`}
    >
      {status}
    </span>
  );
}

export function InspectionsTable({ rows }: { rows: InspectionRow[] }) {
  const columns: Column<InspectionRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      sortValue: (r) => r.inspection_date ?? "",
      render: (r) => (
        <Link href={`/inspections/${r.id}`} className="font-medium text-brand-600 hover:underline">
          {formatInspectionDate(r.inspection_date)}
        </Link>
      ),
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => (r.property_name || r.property_address || "").toLowerCase(),
      render: (r) => (
        <div>
          <div className="text-slate-800">{r.property_name || "—"}</div>
          {r.property_address && (
            <div className="text-xs text-slate-400">{r.property_address}</div>
          )}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      sortable: true,
      sortValue: (r) => (r.inspection_reason || "").toLowerCase(),
      render: (r) => <span className="text-slate-600">{r.inspection_reason || "—"}</span>,
    },
    {
      key: "inspector",
      header: "Inspector",
      sortable: true,
      sortValue: (r) => (r.inspector_name || "").toLowerCase(),
      render: (r) => <span className="text-slate-600">{r.inspector_name || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => r.overall_status ?? "",
      render: (r) => <StatusBadge status={r.overall_status} />,
    },
    {
      key: "photos",
      header: "Photos",
      align: "right",
      sortable: true,
      sortValue: (r) => r.photo_count ?? 0,
      render: (r) =>
        r.photo_count ? (
          <span className="text-slate-600">{r.photo_count}</span>
        ) : (
          <span className="text-slate-300">0</span>
        ),
    },
  ];

  const statusValues = Array.from(
    new Set(rows.map((r) => r.overall_status).filter(Boolean) as string[])
  ).sort();

  const facets: Facet<InspectionRow>[] = [
    {
      key: "status",
      label: "Status",
      options: statusValues.map((s) => ({ value: s, label: s })),
      match: (r, v) => r.overall_status === v,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => String(r.id)}
      search={(r) =>
        `${r.property_name ?? ""} ${r.property_address ?? ""} ${r.inspector_name ?? ""} ${r.inspection_reason ?? ""}`
      }
      searchPlaceholder="Search property, inspector, reason…"
      facets={facets}
      initialSort={{ key: "date", dir: "desc" }}
    />
  );
}
