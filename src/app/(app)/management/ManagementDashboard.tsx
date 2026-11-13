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

// Management Dashboard — KPI charts for review/accountability, separate from the
// main dashboard. Server loads the data (management-dashboard.ts); this renders
// it with Recharts. Colors are a validated categorical palette (see the dataviz
// skill); text stays in ink tokens, identity is carried by legends + labels.
const C = {
  blue: "#2563EB",
  orange: "#FF6F00",
  teal: "#0D9488",
  violet: "#7C3AED",
  grid: "#E2E8F0",
  axis: "#64748B",
};

export function ManagementDashboard({ data }: { data: ManagementKpis }) {
  // Recharts measures the DOM, so only draw once mounted (keeps SSR clean and
  // avoids a 0-width first paint). Tiles + headings render immediately.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { workOrders: wo, accounting: acc } = data;
  const notInQb = acc.recorded.rvOnly + acc.recorded.neither;
  const notInRv = acc.recorded.qbOnly + acc.recorded.neither;
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

  return (
    <div className="space-y-8">
      {/* ---- Work Orders ---- */}
      <section>
        <SectionTitle>Work Orders</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Open" value={wo.headline.open} tone={wo.headline.open > 0 ? "amber" : "slate"} />
          <Tile label="Opened this week" value={wo.headline.openedThisWeek} />
          <Tile label="Closed this week" value={wo.headline.closedThisWeek} tone="emerald" />
          <Tile
            label="Median days to close"
            value={wo.headline.medianDaysToClose ?? "—"}
            hint="closed in last 90 days"
          />
          <Tile label="Preventive share" value={`${wo.headline.preventiveShare}%`} hint="of open work" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

          <ChartCard title="Open backlog by stage" subtitle="Current open work orders" className="lg:col-span-2">
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
        </div>
      </section>

      {/* ---- Accounting Ops ---- */}
      <section>
        <SectionTitle>Accounting Ops</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Not in QuickBooks" value={notInQb} tone={notInQb > 0 ? "amber" : "slate"} />
          <Tile label="Not in Rentvine" value={notInRv} tone={notInRv > 0 ? "amber" : "slate"} />
          <Tile label="Archived this week" value={acc.archivedThisWeek} tone="emerald" />
          <Tile label="Active rows" value={acc.recorded.total} hint="not archived / pending" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
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
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TILE_TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-[200px] place-items-center text-sm text-slate-400">{children}</div>;
}
