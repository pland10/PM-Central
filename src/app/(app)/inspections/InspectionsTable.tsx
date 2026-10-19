"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";
import {
  type InspectionRow,
  statusTone,
  needsAttention,
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
      filter: { type: "date", value: (r) => r.inspection_date ?? null },
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
      filter: { type: "text", value: (r) => `${r.property_name ?? ""} ${r.property_address ?? ""}` },
      render: (r) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-800">{r.property_name || "—"}</span>
            {r.inspection_type === "move_in" && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                Move-in
              </span>
            )}
          </div>
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
      filter: { type: "select", value: (r) => r.inspection_reason || "" },
      render: (r) => <span className="text-slate-600">{r.inspection_reason || "—"}</span>,
    },
    {
      key: "inspector",
      header: "Inspector",
      sortable: true,
      sortValue: (r) => (r.inspector_name || "").toLowerCase(),
      filter: { type: "select", value: (r) => r.inspector_name || "" },
      render: (r) => <span className="text-slate-600">{r.inspector_name || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => r.overall_status ?? "",
      filter: { type: "select", value: (r) => r.overall_status ?? "" },
      render: (r) => {
        const handled =
          needsAttention(r.overall_status) &&
          (r.resolution_status === "resolved" || r.resolution_status === "work_order");
        return (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={r.overall_status} />
            {handled && (
              <span className="text-[11px] font-medium text-emerald-600">
                {r.resolution_status === "work_order"
                  ? `✓ WO${r.work_order_ref ? ` #${r.work_order_ref}` : ""}`
                  : "✓ Resolved"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "photos",
      header: "Photos",
      align: "right",
      sortable: true,
      sortValue: (r) => r.photo_count ?? 0,
      filter: { type: "number", value: (r) => r.photo_count ?? 0 },
      render: (r) =>
        r.photo_count ? (
          <span className="text-slate-600">{r.photo_count}</span>
        ) : (
          <span className="text-slate-300">0</span>
        ),
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
      exportName="Inspections"
      initialSort={{ key: "date", dir: "desc" }}
    />
  );
}
