"use client";

import { DataTable, type Column } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";
import type { DepositRow } from "@/lib/security-deposits";

function classify(r: DepositRow): { label: string; cls: string } {
  if (r.holder === "owner") return { label: "Owner-held", cls: "bg-amber-100 text-amber-700" };
  if (r.movedOut) return { label: "Pending refund", cls: "bg-red-100 text-red-700" };
  return { label: "PMI — active", cls: "bg-emerald-100 text-emerald-700" };
}

export function SecurityDepositsTable({ rows }: { rows: DepositRow[] }) {
  const columns: Column<DepositRow>[] = [
    {
      key: "address",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.address.toLowerCase(),
      filter: { type: "text", value: (r) => r.address },
      render: (r) => <span className="text-slate-800">{r.address || "—"}</span>,
    },
    {
      key: "tenant",
      header: "Tenant",
      sortable: true,
      sortValue: (r) => r.tenant.toLowerCase(),
      filter: { type: "text", value: (r) => r.tenant },
      render: (r) => <span className="text-slate-600">{r.tenant || "—"}</span>,
    },
    {
      key: "portfolio",
      header: "Owner / Portfolio",
      sortable: true,
      sortValue: (r) => r.portfolio.toLowerCase(),
      filter: { type: "select", value: (r) => r.portfolio },
      render: (r) => <span className="text-slate-600">{r.portfolio || "—"}</span>,
    },
    {
      key: "status",
      header: "Lease status",
      sortable: true,
      sortValue: (r) => r.status.toLowerCase(),
      filter: { type: "select", value: (r) => r.status },
      render: (r) => <span className="text-slate-600">{r.status || "—"}</span>,
    },
    {
      key: "class",
      header: "Counts as",
      sortable: true,
      sortValue: (r) => classify(r).label,
      filter: { type: "select", value: (r) => classify(r).label },
      exportValue: (r) => classify(r).label,
      render: (r) => {
        const c = classify(r);
        return (
          <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${c.cls}`}>
            {c.label}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Balance",
      align: "right",
      sortable: true,
      sortValue: (r) => r.total,
      exportValue: (r) => r.total,
      render: (r) => <span className="font-medium text-slate-800">{formatCurrency(r.total)}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.leaseId}
      search={(r) => `${r.address} ${r.tenant} ${r.portfolio} ${r.status}`}
      searchPlaceholder="Search property, tenant, owner…"
      exportName="Security Deposits"
      initialSort={{ key: "amount", dir: "desc" }}
    />
  );
}
