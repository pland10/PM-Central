"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import {
  attentionQueue,
  attentionReason,
  lastActivityAt,
  maintenanceKpis,
  recentActivity,
  rowStatus,
  STALLED_DAYS,
  type ActivityItem,
  type AttentionKind,
  type RowStatus,
} from "@/lib/maintenance";
import { pipelineRank, priorityRank, type WorkOrderRow } from "@/lib/work-orders";

// The new Maintenance screen (FEATURE_MAINTENANCE): KPI tiles, the attention
// queue and recent activity up top, the full work-order list below. Layout
// follows the team's portal prototype; every number comes from synced data.

const TZ = "America/New_York";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

const STATUS_PILL: Record<RowStatus, string> = {
  attention: "bg-amber-100 text-amber-700",
  open: "bg-slate-100 text-slate-600",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-sky-100 text-sky-700",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${className}`}>{children}</span>;
}

function requiredAction(r: WorkOrderRow, now: number): { label: string; status: RowStatus } {
  const status = rowStatus(r, now);
  if (status === "completed") return { label: "Completed", status };
  if (status === "cancelled") return { label: "Cancelled", status };
  return { label: attentionReason(r, now)?.label ?? "No action required", status };
}

function WoNumber({ r }: { r: WorkOrderRow }) {
  return r.link ? (
    <a href={r.link} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-semibold text-brand-600 hover:underline" title="Open in LeadSimple">
      {r.number}
    </a>
  ) : (
    <span className="font-mono text-xs text-slate-500">{r.number}</span>
  );
}

function Property({ r }: { r: WorkOrderRow }) {
  return r.propertyId ? (
    <Link href={`/properties/${r.propertyId}`} className="text-slate-600 hover:text-brand-600">
      {r.property}
    </Link>
  ) : (
    <span className="text-slate-600">{r.property}</span>
  );
}

const TONES = {
  red: { card: "bg-rose-50", icon: "bg-rose-200 text-rose-700" },
  amber: { card: "bg-orange-50", icon: "bg-orange-200 text-orange-800" },
  blue: { card: "bg-sky-50", icon: "bg-sky-200 text-sky-700" },
  purple: { card: "bg-violet-50", icon: "bg-violet-200 text-violet-700" },
  green: { card: "bg-emerald-50", icon: "bg-emerald-200 text-emerald-700" },
} as const;

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: string; tone: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-3 rounded-xl border border-slate-200 p-3 shadow-sm sm:p-3.5 ${t.card}`}>
      <div className={`hidden h-11 w-11 shrink-0 place-items-center rounded-full text-lg sm:grid ${t.icon}`} aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold leading-none text-slate-900">{value}</div>
        <div className="mt-1 text-xs font-bold text-slate-800">{label}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function Section({ title, meta, children, label }: { title: string; meta?: string; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {meta && <span className="text-[11px] text-slate-500">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

const REASON_PILL: Record<AttentionKind, string> = {
  rvClosed: "bg-sky-100 text-sky-700",
  overdue: "bg-red-100 text-red-700",
  high: "bg-red-100 text-red-700",
  new: "bg-amber-100 text-amber-700",
  stalled: "bg-amber-100 text-amber-700",
};

const DOT: Record<ActivityItem["event"], string> = {
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
  created: "bg-blue-500",
  updated: "bg-amber-500",
};

export function MaintenanceView({ rows, now }: { rows: WorkOrderRow[]; now: number }) {
  const kpis = maintenanceKpis(rows, now);
  // Every flagged work order (not just the top few), in urgency order; `order`
  // keeps that order available as the default sort.
  const queue = attentionQueue(rows, now, Infinity).map((q, order) => ({ ...q, order }));
  // Recent activity: the latest 6, expandable to everything in the last week.
  const RECENT_SHOWN = 6;
  const allRecent = recentActivity(rows, Infinity);
  const week = allRecent.filter((a) => Date.parse(a.at) >= now - 7 * 86_400_000);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const recent = showAllRecent ? week : allRecent.slice(0, RECENT_SHOWN);

  // The title + KPI tiles stay pinned on wide screens; tell the tables below
  // how tall that is so their own sticky headers pin just under it.
  const pageRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const page = pageRef.current;
    const summary = summaryRef.current;
    if (!page || !summary || typeof ResizeObserver === "undefined") return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () => page.style.setProperty("--sticky-offset", wide.matches ? `${summary.offsetHeight}px` : "0px");
    const ro = new ResizeObserver(update);
    ro.observe(summary);
    wide.addEventListener("change", update);
    update();
    return () => {
      ro.disconnect();
      wide.removeEventListener("change", update);
    };
  }, []);

  const columns: Column<WorkOrderRow>[] = [
    {
      key: "number",
      header: "WO #",
      sortable: true,
      sortValue: (r) => Number(r.number) || 0,
      filter: { type: "text", value: (r) => r.number },
      render: (r) => <WoNumber r={r} />,
    },
    {
      key: "issue",
      header: "Work order",
      sortable: true,
      sortValue: (r) => r.issue.toLowerCase(),
      filter: { type: "text", value: (r) => r.issue },
      render: (r) => <span className="text-slate-800">{r.issue}</span>,
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.property.toLowerCase(),
      filter: { type: "text", value: (r) => r.property },
      render: (r) => <Property r={r} />,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      sortValue: (r) => pipelineRank(r.stage),
      filter: { type: "select", value: (r) => r.stage },
      render: (r) => <span className="text-slate-600">{r.stage}</span>,
    },
    {
      key: "rvStatus",
      header: "Rentvine",
      sortable: true,
      sortValue: (r) => r.rvStatus,
      filter: { type: "select", value: (r) => r.rvStatus },
      render: (r) => (r.rvStatus ? <span className="text-slate-600">{r.rvStatus}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      sortValue: (r) => priorityRank(r.priority),
      filter: { type: "select", value: (r) => r.priority },
      render: (r) =>
        r.priority ? (
          <Pill className={r.priority === "High" ? "bg-red-100 text-red-700" : r.priority === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
            {r.priority}
          </Pill>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "vendor",
      header: "Vendor",
      sortable: true,
      sortValue: (r) => r.vendor.toLowerCase(),
      filter: { type: "select", value: (r) => r.vendor },
      render: (r) => (r.vendor ? <span className="text-slate-600">{r.vendor}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "assignee",
      header: "Assigned",
      sortable: true,
      sortValue: (r) => r.assignee.toLowerCase(),
      filter: { type: "select", value: (r) => r.assignee },
      render: (r) => (r.assignee ? <span className="text-slate-600">{r.assignee}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "action",
      header: "Required action",
      sortable: true,
      sortValue: (r) => requiredAction(r, now).label,
      exportValue: (r) => requiredAction(r, now).label,
      render: (r) => {
        const a = requiredAction(r, now);
        return <Pill className={STATUS_PILL[a.status]}>{a.label}</Pill>;
      },
    },
    {
      key: "lastActivity",
      header: "Last activity",
      sortable: true,
      sortValue: (r) => lastActivityAt(r) ?? "",
      exportValue: (r) => when(lastActivityAt(r)),
      render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{when(lastActivityAt(r))}</span>,
    },
  ];

  type Flagged = (typeof queue)[number];
  const attentionColumns: Column<Flagged>[] = [
    {
      key: "number",
      header: "WO #",
      sortable: true,
      sortValue: (q) => Number(q.row.number) || 0,
      filter: { type: "text", value: (q) => q.row.number },
      render: (q) => <WoNumber r={q.row} />,
    },
    {
      key: "issue",
      header: "Work order",
      sortable: true,
      sortValue: (q) => q.row.issue.toLowerCase(),
      filter: { type: "text", value: (q) => q.row.issue },
      render: (q) => <span className="text-slate-800">{q.row.issue}</span>,
    },
    {
      key: "action",
      header: "Required action",
      sortable: true,
      sortValue: (q) => q.order,
      exportValue: (q) => q.reason.label,
      render: (q) => <Pill className={REASON_PILL[q.reason.kind]}>{q.reason.label}</Pill>,
    },
    {
      key: "property",
      header: "Property",
      sortable: true,
      sortValue: (q) => q.row.property.toLowerCase(),
      filter: { type: "text", value: (q) => q.row.property },
      render: (q) => <Property r={q.row} />,
    },
    {
      key: "vendor",
      header: "Vendor",
      sortable: true,
      sortValue: (q) => q.row.vendor.toLowerCase(),
      filter: { type: "select", value: (q) => q.row.vendor },
      render: (q) => (q.row.vendor ? <span className="text-slate-600">{q.row.vendor}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      sortValue: (q) => q.row.dueAt ?? "",
      exportValue: (q) => day(q.row.dueAt),
      render: (q) => <span className="whitespace-nowrap text-xs text-slate-600">{day(q.row.dueAt)}</span>,
    },
    {
      key: "lastActivity",
      header: "Last activity",
      sortable: true,
      sortValue: (q) => lastActivityAt(q.row) ?? "",
      exportValue: (q) => when(lastActivityAt(q.row)),
      render: (q) => <span className="whitespace-nowrap text-xs text-slate-500">{when(lastActivityAt(q.row))}</span>,
    },
  ];
  const reasonFacet: Facet<Flagged>[] = [
    {
      key: "reason",
      label: "Reason",
      options: [
        { value: "rvClosed", label: "Closed in Rentvine" },
        { value: "overdue", label: "Overdue" },
        { value: "high", label: "High priority" },
        { value: "new", label: "New WO waiting" },
        { value: "stalled", label: "Stalled" },
      ],
      match: (q, v) => q.reason.kind === v,
    },
  ];

  const facets: Facet<WorkOrderRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Open (all)" },
        { value: "attention", label: "Needs attention" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
      match: (r, v) => (v === "active" ? !r.terminal : rowStatus(r, now) === v),
    },
  ];

  return (
    <div ref={pageRef} className="mx-auto max-w-7xl">
      {/* Pinned on lg+ (title + KPIs); the negative margins let it cover the
          page padding so rows don't show around it while scrolling. */}
      <section
        ref={summaryRef}
        aria-label="Maintenance summary"
        className="z-20 -mx-6 -mt-6 px-6 pb-4 pt-6 lg:sticky lg:top-0 lg:border-b lg:border-slate-200"
        style={{ background: "var(--background)" }}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Maintenance</h1>
            <p className="mt-1 text-sm text-slate-500">Work orders, exceptions and follow-ups — live from LeadSimple and Rentvine.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Preview — replaces Work Orders when ready</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Open" value={String(kpis.open)} sub="Not closed in LeadSimple" icon="▤" tone="red" />
          <Kpi label="Stalled" value={String(kpis.stalled)} sub={`No activity > ${STALLED_DAYS} days`} icon="◷" tone="amber" />
          <Kpi
            label="Overdue"
            value={kpis.hasDueDates ? String(kpis.overdue) : "—"}
            sub={kpis.hasDueDates ? "Past due date" : "Due dates not synced yet"}
            icon="!"
            tone="blue"
          />
          <Kpi label="New WOs waiting" value={String(kpis.newWaiting)} sub="In New WO over a day" icon="✚" tone="purple" />
          <Kpi label="Completed this week" value={String(kpis.completedThisWeek)} sub="Closed in the last 7 days" icon="✓" tone="green" />
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Section title="Work Orders Requiring Attention" meta={`${queue.length} work order${queue.length === 1 ? "" : "s"}`}>
          {queue.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No work orders currently require attention.</div>
          ) : (
            <div className="p-3">
              <DataTable
                rows={queue}
                columns={attentionColumns}
                rowKey={(q) => q.row.id}
                search={(q) => `${q.row.number} ${q.row.issue} ${q.row.property} ${q.row.vendor} ${q.reason.label}`}
                searchPlaceholder="Search attention list…"
                exportName="Maintenance - Attention"
                facets={reasonFacet}
                initialSort={{ key: "action", dir: "asc" }}
              />
            </div>
          )}
        </Section>

        <Section title="Recent Activity" meta={allRecent.length ? `${week.length} in the last 7 days` : "No activity"}>
          <ul className="grid grid-cols-1 gap-x-8 px-4 pb-2 xl:grid-cols-2">
            {recent.map((a) => (
              <li key={a.row.id} className="grid grid-cols-[10px_1fr_auto] items-center gap-2.5 border-b border-slate-100 py-2.5 text-xs last:border-0">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[a.event]}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    WO #{a.row.number} {a.event}
                  </div>
                  <div className="truncate text-slate-500" title={a.detail}>
                    {a.detail}
                  </div>
                </div>
                <span className="whitespace-nowrap text-[11px] text-slate-400">{when(a.at)}</span>
              </li>
            ))}
          </ul>
          {week.length > RECENT_SHOWN && (
            <button
              onClick={() => setShowAllRecent((v) => !v)}
              className="mb-3 w-full text-center text-xs font-medium text-brand-600 hover:underline"
            >
              {showAllRecent ? "Show less" : `Show all ${week.length} from the last 7 days →`}
            </button>
          )}
        </Section>
      </div>

      <div className="mt-4">
        <Section title="All Work Orders" label="All work orders" meta={`${rows.length} synced`}>
          <div className="p-3">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              search={(r) => `${r.number} ${r.issue} ${r.property} ${r.vendor} ${r.assignee} ${r.stage}`}
              searchPlaceholder="Search work order, property, vendor…"
              exportName="Maintenance"
              facets={facets}
              initialFacets={{ status: "active" }}
              initialSort={{ key: "lastActivity", dir: "desc" }}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
