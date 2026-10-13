"use client";

import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import type { ShowingRow } from "@/lib/showings";

export type { ShowingRow };

// Status pill colors. Live states lean brand/amber; resolved states go muted.
const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700",
  scheduled: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500/20",
  confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
  "no-show": "bg-red-100 text-red-700",
};

// Sort weight: live/soonest-relevant statuses first.
const STATUS_RANK: Record<string, number> = {
  requested: 0,
  scheduled: 1,
  confirmed: 2,
  completed: 3,
  "no-show": 4,
  cancelled: 5,
};

function statusLabel(s: string): string {
  return s === "no-show" ? "No show" : s.charAt(0).toUpperCase() + s.slice(1);
}

function statusBadge(s: string) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${
        STATUS_STYLES[s] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {statusLabel(s)}
    </span>
  );
}

function typeLabel(t: string | null): string {
  if (!t) return "";
  const v = t.toLowerCase();
  if (v.includes("self")) return "Self-access";
  if (v.includes("person")) return "In-person";
  return t;
}

function fmtWhen(iso: string | null): { abs: string; rel: string } {
  if (!iso) return { abs: "", rel: "" };
  const d = new Date(iso);
  const abs = d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const diffDays = Math.round((d.getTime() - Date.now()) / 86400000);
  let rel: string;
  if (diffDays === 0) rel = "today";
  else if (diffDays === 1) rel = "tomorrow";
  else if (diffDays === -1) rel = "yesterday";
  else if (diffDays > 0) rel = `in ${diffDays}d`;
  else rel = `${-diffDays}d ago`;
  return { abs, rel };
}

// A short calendar date, e.g. "Jun 3, 2026". Empty string when absent.
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// move-in comes through as an ISO date (backfill) or free text (rare). Show a
// clean date when it parses, otherwise the raw value.
function fmtMoveIn(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : fmtDate(v);
}

function isUpcoming(r: ShowingRow): boolean {
  if (!r.startTime) return false;
  if (["cancelled", "no-show", "completed"].includes(r.status)) return false;
  // Count anything from the start of today forward as upcoming.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(r.startTime).getTime() >= startOfToday.getTime();
}

export function ShowingsTable({ rows }: { rows: ShowingRow[] }) {
  const columns: Column<ShowingRow>[] = [
    {
      key: "address",
      header: "Property",
      sortable: true,
      sortValue: (r) => r.address.toLowerCase(),
      filter: { type: "text", value: (r) => r.address },
      render: (r) =>
        r.propertyId ? (
          <Link href={`/properties/${r.propertyId}`} className="text-slate-700 hover:text-brand-600">
            {r.address}
          </Link>
        ) : (
          <span className="text-slate-700">{r.address}</span>
        ),
    },
    {
      key: "when",
      header: "Showing time",
      sortable: true,
      // Soonest upcoming first when ascending; showings with no time sort last.
      sortValue: (r) => (r.startTime ? new Date(r.startTime).getTime() : Number.MAX_SAFE_INTEGER),
      exportValue: (r) => r.startTime ?? "",
      render: (r) => {
        if (!r.startTime) {
          return r.bookedAt ? (
            <div className="whitespace-nowrap text-xs text-slate-400">booked {fmtDate(r.bookedAt)}</div>
          ) : (
            <span className="text-slate-300">—</span>
          );
        }
        const { abs, rel } = fmtWhen(r.startTime);
        return (
          <div className="whitespace-nowrap">
            <div className="text-slate-700">{abs}</div>
            <div className="text-xs text-slate-400">
              {rel}
              {r.bookedAt ? ` · booked ${fmtDate(r.bookedAt)}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "submitted",
      header: "Submitted",
      sortable: true,
      sortValue: (r) => (r.leadSubmittedAt ? new Date(r.leadSubmittedAt).getTime() : 0),
      exportValue: (r) => r.leadSubmittedAt ?? "",
      render: (r) =>
        r.leadSubmittedAt ? (
          <span className="whitespace-nowrap text-slate-600">{fmtDate(r.leadSubmittedAt)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "moveIn",
      header: "Move-in",
      sortable: true,
      sortValue: (r) => {
        const t = r.moveIn ? new Date(r.moveIn).getTime() : NaN;
        return Number.isNaN(t) ? 0 : t;
      },
      exportValue: (r) => r.moveIn ?? "",
      render: (r) =>
        r.moveIn ? (
          <span className="whitespace-nowrap text-slate-600">{fmtMoveIn(r.moveIn)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => STATUS_RANK[r.status] ?? 9,
      filter: {
        type: "select",
        value: (r) => r.status,
        options: Object.keys(STATUS_RANK).map((s) => ({ value: s, label: statusLabel(s) })),
      },
      exportValue: (r) => statusLabel(r.status),
      render: (r) => statusBadge(r.status),
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (r) => typeLabel(r.viewingType).toLowerCase(),
      filter: { type: "select", value: (r) => typeLabel(r.viewingType) },
      render: (r) =>
        r.viewingType ? (
          <span className="text-slate-600">{typeLabel(r.viewingType)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "lead",
      header: "Lead",
      sortable: true,
      sortValue: (r) => (r.leadName ?? "").toLowerCase(),
      filter: { type: "text", value: (r) => `${r.leadName ?? ""} ${r.leadEmail ?? ""} ${r.leadPhone ?? ""}` },
      exportValue: (r) => r.leadName ?? "",
      render: (r) =>
        r.leadName || r.leadEmail || r.leadPhone ? (
          <div className="max-w-[220px]">
            {r.leadName && <div className="truncate text-slate-700">{r.leadName}</div>}
            {(r.leadEmail || r.leadPhone) && (
              <div className="truncate text-xs text-slate-400">{r.leadEmail || r.leadPhone}</div>
            )}
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "source",
      header: "Lead source",
      sortable: true,
      sortValue: (r) => (r.acquisitionSource ?? "").toLowerCase(),
      filter: { type: "select", value: (r) => r.acquisitionSource ?? "" },
      render: (r) =>
        r.acquisitionSource ? (
          <span className="text-slate-600">{r.acquisitionSource}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "agent",
      header: "Agent",
      sortable: true,
      sortValue: (r) => (r.agentName ?? "").toLowerCase(),
      filter: { type: "select", value: (r) => r.agentName ?? "" },
      render: (r) =>
        r.agentName ? (
          <span className="text-slate-600">{r.agentName}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "feedback",
      header: "Feedback",
      sortable: true,
      sortValue: (r) => r.feedbackRating ?? -1,
      exportValue: (r) => (r.feedbackRating != null ? String(r.feedbackRating) : ""),
      render: (r) => {
        if (r.feedbackRating == null && !r.feedbackComments) return <span className="text-slate-300">—</span>;
        return (
          <div className="max-w-[220px]">
            {r.feedbackRating != null && (
              <div className="text-amber-500" title={`${r.feedbackRating} / 5`}>
                {"★".repeat(Math.max(0, Math.min(5, r.feedbackRating)))}
                <span className="text-slate-300">
                  {"★".repeat(Math.max(0, 5 - Math.min(5, r.feedbackRating)))}
                </span>
              </div>
            )}
            {r.feedbackComments && (
              <div className="truncate text-xs text-slate-500" title={r.feedbackComments}>
                {r.feedbackComments}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  // Upcoming / past is a cross-cutting view toggle derived from startTime+status,
  // so it's a top-level facet. Default to upcoming (what leasing cares about).
  const facets: Facet<ShowingRow>[] = [
    {
      key: "window",
      label: "When",
      options: [
        { value: "upcoming", label: "Upcoming" },
        { value: "past", label: "Past" },
        { value: "all", label: "All" },
      ],
      match: (r, v) => (v === "all" ? true : v === "upcoming" ? isUpcoming(r) : !isUpcoming(r)),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) =>
        `${r.address} ${r.leadName ?? ""} ${r.leadEmail ?? ""} ${r.leadPhone ?? ""} ${r.agentName ?? ""} ${r.acquisitionSource ?? ""}`
      }
      searchPlaceholder="Search address, lead, agent…"
      exportName="Showings"
      facets={facets}
      initialSort={{ key: "when", dir: "asc" }}
      initialFacets={{ window: "upcoming" }}
    />
  );
}
