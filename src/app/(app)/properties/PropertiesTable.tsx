"use client";

import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";

export type PropertyRow = {
  id: string;
  title: string;
  address: string;
  owner: string;
  unitCount: number;
  occupied: number;
  occupancy: number;
  rentRoll: number;
  type: string;
  source: string;
  program: "managed" | "squatterwatch";
};

function sourceBadge(source: string) {
  const styles: Record<string, string> = {
    manual: "bg-slate-100 text-slate-600",
    rentvine: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[source] ?? "bg-indigo-100 text-indigo-700"
      }`}
    >
      {source}
    </span>
  );
}

export function PropertiesTable({ rows }: { rows: PropertyRow[] }) {
  const columns: Column<PropertyRow>[] = [
    {
      key: "title",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.title.toLowerCase(),
      render: (r) => (
        <>
          <div className="flex items-center gap-2">
            <Link
              href={`/properties/${r.id}`}
              className="font-medium text-slate-900 hover:text-brand-600"
            >
              {r.title}
            </Link>
            {r.program === "squatterwatch" && (
              <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Squatter Watch
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">{r.address}</div>
        </>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortable: true,
      sortValue: (r) => r.owner.toLowerCase(),
      render: (r) => <span className="text-slate-600">{r.owner}</span>,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      sortable: true,
      sortValue: (r) => r.unitCount,
      render: (r) => <span className="text-slate-600">{r.unitCount}</span>,
    },
    {
      key: "occupancy",
      header: "Occupancy",
      align: "right",
      sortable: true,
      sortValue: (r) => r.occupancy,
      render: (r) => (
        <>
          <span
            className={
              r.occupancy === 100
                ? "text-emerald-600"
                : r.occupancy === 0
                ? "text-slate-400"
                : "text-amber-600"
            }
          >
            {r.occupancy}%
          </span>
          <span className="text-xs text-slate-400">
            {" "}
            ({r.occupied}/{r.unitCount})
          </span>
        </>
      ),
    },
    {
      key: "rentRoll",
      header: "Rent roll",
      align: "right",
      sortable: true,
      sortValue: (r) => r.rentRoll,
      render: (r) => <span className="text-slate-600">{formatCurrency(r.rentRoll)}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (r) => r.type,
      render: (r) => <span className="capitalize text-slate-600">{r.type.replace("-", " ")}</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (r) => sourceBadge(r.source),
    },
  ];

  const typeOptions = Array.from(new Set(rows.map((r) => r.type)))
    .sort()
    .map((t) => ({ value: t, label: t.replace("-", " ") }));
  const sourceOptions = Array.from(new Set(rows.map((r) => r.source)))
    .sort()
    .map((s) => ({ value: s, label: s }));

  const facets: Facet<PropertyRow>[] = [
    {
      key: "program",
      label: "Program",
      options: [
        { value: "managed", label: "Under management" },
        { value: "squatterwatch", label: "Squatter Watch" },
      ],
      match: (r, v) => r.program === v,
    },
    {
      key: "occupancy",
      label: "Occupancy",
      options: [
        { value: "full", label: "Full (100%)" },
        { value: "partial", label: "Partial" },
        { value: "vacant", label: "Vacant (0%)" },
      ],
      match: (r, v) =>
        v === "full" ? r.occupancy === 100 : v === "vacant" ? r.occupancy === 0 : r.occupancy > 0 && r.occupancy < 100,
    },
    {
      key: "type",
      label: "Type",
      options: typeOptions,
      match: (r, v) => r.type === v,
    },
    {
      key: "source",
      label: "Source",
      options: sourceOptions,
      match: (r, v) => r.source === v,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => `${r.title} ${r.address} ${r.owner}`}
      searchPlaceholder="Search address or owner…"
      facets={facets}
      initialSort={{ key: "title", dir: "asc" }}
      initialFacets={{ program: "managed" }}
    />
  );
}
