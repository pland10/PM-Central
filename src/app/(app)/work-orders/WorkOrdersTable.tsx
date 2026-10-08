"use client";

import { DataTable, type Column, type Facet } from "@/components/DataTable";
import { STAGE_ORDER, pipelineRank, type WorkOrderRow } from "@/lib/work-orders";

export type { WorkOrderRow };

function stageBadge(stage: string, terminal: boolean) {
  const cls = terminal
    ? "bg-slate-100 text-slate-500"
    : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500/20";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {stage}
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
      render: (r) =>
        r.link ? (
          <a
            href={r.link}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-brand-600 hover:underline"
          >
            {r.number}
          </a>
        ) : (
          <span className="font-mono text-xs text-slate-400">{r.number}</span>
        ),
    },
    {
      key: "issue",
      header: "Issue",
      sortable: true,
      sortValue: (r) => r.issue.toLowerCase(),
      render: (r) => <span className="text-slate-800">{r.issue}</span>,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      // Pipeline order, latest stage first (matches the dashboard). Terminal
      // stages (rank -1) fall to the bottom of a descending sort.
      sortValue: (r) => pipelineRank(r.stage),
      render: (r) => stageBadge(r.stage, r.terminal),
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.property.toLowerCase(),
      render: (r) => <span className="text-slate-600">{r.property}</span>,
    },
    {
      key: "vendor",
      header: "Vendor",
      sortable: true,
      sortValue: (r) => r.vendor.toLowerCase(),
      render: (r) =>
        r.vendor ? (
          <span className="text-slate-600">{r.vendor}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "assignee",
      header: "Assignee",
      sortable: true,
      sortValue: (r) => r.assignee.toLowerCase(),
      render: (r) =>
        r.assignee ? (
          <span className="text-slate-600">{r.assignee}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  // Stage facet in pipeline order (latest first), listing only stages present.
  const present = new Set(rows.map((r) => r.stage));
  const ordered = [...STAGE_ORDER].reverse().filter((s) => present.has(s));
  const extras = [...present].filter((s) => !STAGE_ORDER.includes(s)).sort();
  const stageOptions = [...ordered, ...extras].map((s) => ({ value: s, label: s }));

  const facets: Facet<WorkOrderRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "closed", label: "Closed" },
      ],
      match: (r, v) => (v === "active" ? !r.terminal : r.terminal),
    },
    {
      key: "stage",
      label: "Stage",
      options: stageOptions,
      match: (r, v) => r.stage === v,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.number} ${r.issue} ${r.property} ${r.vendor} ${r.assignee}`}
      searchPlaceholder="Search WO#, issue, property, vendor…"
      facets={facets}
      initialSort={{ key: "stage", dir: "desc" }}
      initialFacets={{ status: "active" }}
    />
  );
}
