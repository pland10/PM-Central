"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";

export type PortfolioRow = {
  id: string;
  name: string;
  propertyCount: number;
  unitCount: number;
  occupied: number;
  rentRoll: number;
};

export function PortfoliosTable({ rows }: { rows: PortfolioRow[] }) {
  const columns: Column<PortfolioRow>[] = [
    {
      key: "name",
      header: "Portfolio / Owner",
      sortable: true,
      sortValue: (r) => r.name.toLowerCase(),
      filter: { type: "text", value: (r) => r.name },
      render: (r) => (
        <Link href={`/portfolios/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">
          {r.name}
        </Link>
      ),
    },
    {
      key: "properties",
      header: "Properties",
      align: "right",
      sortable: true,
      sortValue: (r) => r.propertyCount,
      filter: { type: "number", value: (r) => r.propertyCount },
      render: (r) => <span className="text-slate-600">{r.propertyCount}</span>,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      sortable: true,
      sortValue: (r) => r.unitCount,
      filter: { type: "number", value: (r) => r.unitCount },
      render: (r) => (
        <span className="text-slate-600">
          {r.occupied}/{r.unitCount}
        </span>
      ),
    },
    {
      key: "rentRoll",
      header: "Rent roll / mo",
      align: "right",
      sortable: true,
      sortValue: (r) => r.rentRoll,
      filter: { type: "number", value: (r) => r.rentRoll },
      render: (r) => <span className="text-slate-700">{formatCurrency(r.rentRoll)}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => r.name}
      searchPlaceholder="Search owner…"
      initialSort={{ key: "rentRoll", dir: "desc" }}
    />
  );
}
