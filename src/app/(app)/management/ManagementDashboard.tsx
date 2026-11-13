"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ManagementKpis } from "@/lib/management-dashboard";
import { SortableLayout, type LayoutSection, type LayoutWidget } from "./SortableLayout";

// Management Dashboard — KPI charts for review/accountability, separate from the
// main dashboard. Server loads the data (management-dashboard.ts); this renders
// it with Recharts. Colors are a validated categorical palette (see the dataviz
// skill); text stays in ink tokens, identity is carried by legends + labels.
const C = {
  blue: "#2563EB",
  orange: "#FF6F00",
  teal: "#0D9488",
  violet: "#7C3AED",
  amber: "#D97706", // status: returns / NSF (warning) — always with a label
  grid: "#E2E8F0",
  axis: "#64748B",
};

const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtMoneyAxis = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

export function ManagementDashboard({
  data,
  initialLayout,
  canPersist = false,
}: {
  data: ManagementKpis;
  // Saved arrangement (user_metadata.management_layout), any shape — reconciled.
  initialLayout?: unknown;
  canPersist?: boolean;
}) {
  // Recharts measures the DOM, so only draw once mounted (keeps SSR clean and
  // avoids a 0-width first paint). Tiles + headings render immediately.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { workOrders: wo, accounting: acc } = data;
  const notInQb = acc.recorded.rvOnly + acc.recorded.neither;
  const notInRv = acc.recorded.notInRentvine; // excludes not-reimbursable rows
  const recordedData = [
    { name: "In both", value: acc.recorded.both, fill: C.teal },
    { name: "QuickBooks only", value: acc.recorded.qbOnly, fill: C.blue },
    { name: "Rentvine only", value: acc.recorded.rvOnly, fill: C.violet },
    { name: "Neither", value: acc.recorded.neither, fill: C.orange },
  ];
  const preventiveData = [
    { name: "Preventive", value: wo.preventive.preventive, fill: C.teal },
    { name: "Reactive", value: wo.preventive.reactive, fill: C.blue },
  ];

  const col = data.collections;

  const TILES4 = "grid grid-cols-2 gap-3 sm:grid-cols-4";
  const CHARTS = "grid grid-cols-1 gap-4 lg:grid-cols-2";
  const W = (id: string, label: string, node: React.ReactNode, className?: string): LayoutWidget => ({ id, label, node, className });

  const sections: LayoutSection[] = [
    {
      id: "collections",
      title: "Collections & Rent",
      groups: [
        {
          id: "collections.tiles",
          label: "Tiles",
          gridClass: TILES4,
          widgets: [
            W("col.collected", "Collected this week", <Tile label="Collected this week" value={fmtMoney(col.headline.collectedThisWeek)} tone="emerald" />),
            W("col.pending", "In-flight (pending)", <Tile label="In-flight (pending)" value={fmtMoney(col.headline.pendingTotal)} hint="ACH not yet cleared" />),
            W("col.returnedWeek", "Returned this week", <Tile label="Returned this week" value={col.headline.returnedThisWeek} tone={col.headline.returnedThisWeek > 0 ? "amber" : "slate"} />),
            W("col.returnedWindow", "Returned (window)", <Tile label={`Returned · last ${data.weeks}w`} value={col.headline.returnedTotalWindow} />),
          ],
        },
        {
          id: "collections.charts",
          label: "Charts",
          gridClass: CHARTS,
          widgets: [
            W("col.rent", "Rent collected", (
              <ChartCard title="Rent collected" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={col.collectedByWeek} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis
                        tickFormatter={fmtMoneyAxis}
                        tick={{ fontSize: 11, fill: C.axis }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                      />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(v: number) => [fmtMoney(v), "Collected"]} />
                      <Bar dataKey="amount" name="Collected" fill={C.teal} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
            W("col.returns", "Returned / NSF", (
              <ChartCard title="Returned / NSF" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={col.returnsByWeek} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="count" name="Returned" fill={C.amber} radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
          ],
        },
      ],
    },
    {
      id: "workorders",
      title: "Work Orders",
      groups: [
        {
          id: "workorders.tiles",
          label: "Tiles",
          gridClass: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
          widgets: [
            W("wo.open", "Open", <Tile label="Open" value={wo.headline.open} tone={wo.headline.open > 0 ? "amber" : "slate"} />),
            W("wo.opened", "Opened this week", <Tile label="Opened this week" value={wo.headline.openedThisWeek} />),
            W("wo.closed", "Closed this week", <Tile label="Closed this week" value={wo.headline.closedThisWeek} tone="emerald" />),
            W("wo.median", "Median days to close", <Tile label="Median days to close" value={wo.headline.medianDaysToClose ?? "—"} hint="closed in last 90 days" />),
            W("wo.preventiveShare", "Preventive share", <Tile label="Preventive share" value={`${wo.headline.preventiveShare}%`} hint="of open work" />),
          ],
        },
        {
          id: "workorders.charts",
          label: "Charts",
          gridClass: CHARTS,
          widgets: [
            W("wo.openedClosed", "Opened vs closed", (
              <ChartCard title="Opened vs closed" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={wo.openedClosed} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="opened" name="Opened" fill={C.blue} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="closed" name="Closed" fill={C.teal} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
            W("wo.preventive", "Preventive vs reactive", (
              <ChartCard title="Preventive vs reactive" subtitle="Open work orders">
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={preventiveData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {preventiveData.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                        <LabelList dataKey="value" position="outside" style={{ fontSize: 12, fill: "#334155" }} />
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
            W("wo.backlog", "Open backlog by stage", (
              <ChartCard title="Open backlog by stage" subtitle="Current open work orders">
                {mounted && wo.backlog.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, wo.backlog.length * 34)}>
                    <BarChart
                      layout="vertical"
                      data={wo.backlog}
                      margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid horizontal={false} stroke={C.grid} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="stage" width={190} tick={{ fontSize: 11, fill: "#334155" }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="count" name="Open" fill={C.orange} radius={[0, 3, 3, 0]}>
                        <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  mounted && <Empty>No open work orders.</Empty>
                )}
              </ChartCard>
            ), "lg:col-span-2"),
          ],
        },
      ],
    },
    {
      id: "accounting",
      title: "Accounting Ops",
      groups: [
        {
          id: "accounting.tiles",
          label: "Tiles",
          gridClass: TILES4,
          widgets: [
            W("acc.notInQb", "Not in QuickBooks", <Tile label="Not in QuickBooks" value={notInQb} tone={notInQb > 0 ? "amber" : "slate"} />),
            W("acc.notInRv", "Not in Rentvine", <Tile label="Not in Rentvine" value={notInRv} tone={notInRv > 0 ? "amber" : "slate"} hint="excl. not reimbursable" />),
            W("acc.archivedWeek", "Archived this week", <Tile label="Archived this week" value={acc.archivedThisWeek} tone="emerald" />),
            W("acc.active", "Active rows", <Tile label="Active rows" value={acc.recorded.total} hint="not archived / pending" />),
          ],
        },
        {
          id: "accounting.charts",
          label: "Charts",
          gridClass: CHARTS,
          widgets: [
            W("acc.archived", "Rows archived", (
              <ChartCard title="Rows archived" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={acc.archivedByWeek} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="count" name="Archived" fill={C.orange} radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
            W("acc.recorded", "Recorded in QuickBooks / Rentvine", (
              <ChartCard title="Recorded in QuickBooks / Rentvine" subtitle="Active transactions">
                {mounted && acc.recorded.total > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={recordedData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {recordedData.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                        <LabelList dataKey="value" position="outside" style={{ fontSize: 12, fill: "#334155" }} />
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  mounted && <Empty>No active transactions.</Empty>
                )}
              </ChartCard>
            )),
          ],
        },
      ],
    },
    {
      id: "leasing",
      title: "Portfolio & Leasing",
      groups: [
        {
          id: "leasing.tiles",
          label: "Tiles",
          gridClass: TILES4,
          widgets: [
            W("lease.occupancy", "Occupancy", <Tile label="Occupancy" value={`${data.leasing.occupancy.occupancyPct}%`} tone="emerald" hint={`${data.leasing.occupancy.occupied} of ${data.leasing.occupancy.occupied + data.leasing.occupancy.vacant} rentable`} />),
            W("lease.active", "Active leases", <Tile label="Active leases" value={data.leasing.activeLeases} />),
            W("lease.vacant", "Vacant units", <Tile label="Vacant units" value={data.leasing.occupancy.vacant} tone={data.leasing.occupancy.vacant > 0 ? "amber" : "slate"} />),
            W("lease.fill", "Median days to fill", <Tile label="Median days to fill" value={data.leasing.medianDaysToFill ?? "—"} hint="turnaround, last 180 days" />),
          ],
        },
        {
          id: "leasing.charts",
          label: "Charts",
          gridClass: CHARTS,
          widgets: [
            W("lease.inspections", "Inspections completed", (
              <ChartCard title="Inspections completed" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.leasing.inspectionsByWeek} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="count" name="Completed" fill={C.violet} radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
            W("lease.showings", "Showings", (
              <ChartCard title="Showings" subtitle={`Per week · last ${data.weeks} weeks`}>
                {mounted && (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.leasing.showingsByWeek} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="count" name="Showings" fill={C.blue} radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )),
          ],
        },
      ],
    },
  ];

  return <SortableLayout sections={sections} initialLayout={initialLayout ?? null} canPersist={canPersist} />;
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      <div className="min-h-[160px]">{children}</div>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  slate: "text-slate-800",
};

function Tile({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TILE_TONES;
}) {
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TILE_TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-[200px] place-items-center text-sm text-slate-400">{children}</div>;
}
