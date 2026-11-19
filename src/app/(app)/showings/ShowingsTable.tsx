"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
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

const hasPrescreen = (r: ShowingRow) => !!r.leadComments || r.leadQuestions.length > 0 || !!r.showingMessage;

function qualifiedPill(q: boolean | null) {
  if (q == null) return null;
  return q ? (
    <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Qualified</span>
  ) : (
    <span className="inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">Not qualified</span>
  );
}

// The lead's pre-screening from Tenant Turner: inquiry comment, answers, and
// the message on the showing.
function PrescreenModal({ r, onClose }: { r: ShowingRow; onClose: () => void }) {
  return (
    <Modal
      title={`Pre-screen · ${r.leadName ?? "Lead"}`}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {r.leadQualified != null && <div>{qualifiedPill(r.leadQualified)}</div>}
        {r.leadComments && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Their comment</h3>
            <p className="mt-1 whitespace-pre-wrap">{r.leadComments}</p>
          </section>
        )}
        {r.leadQuestions.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-screen answers</h3>
            <dl className="mt-1 space-y-2">
              {r.leadQuestions.map((q, i) => (
                <div key={i}>
                  <dt className="text-slate-500">{q.question}</dt>
                  <dd className="font-medium text-slate-800">{q.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {r.showingMessage && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Showing message</h3>
            <p className="mt-1 whitespace-pre-wrap">{r.showingMessage}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}

export function ShowingsTable({ rows }: { rows: ShowingRow[] }) {
  const [prescreenFor, setPrescreenFor] = useState<ShowingRow | null>(null);
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
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => STATUS_RANK[r.status] ?? 9,
      filter: {
        type: "select",
        value: (r) => r.status,
        options: Object.keys(STATUS_RANK).map((s) => ({ value: s, label: statusLabel(s) })),
      },
      exportValue: (r) => [statusLabel(r.status), typeLabel(r.viewingType)].filter(Boolean).join(" · "),
      render: (r) => (
        <div className="whitespace-nowrap">
          {statusBadge(r.status)}
          {r.viewingType && <div className="mt-0.5 text-xs text-slate-400">{typeLabel(r.viewingType)}</div>}
        </div>
      ),
    },
    {
      key: "lead",
      header: "Lead",
      sortable: true,
      sortValue: (r) => (r.leadName ?? "").toLowerCase(),
      filter: { type: "text", value: (r) => `${r.leadName ?? ""} ${r.leadEmail ?? ""} ${r.leadPhone ?? ""}` },
      exportValue: (r) =>
        [
          r.leadName,
          r.leadEmail || r.leadPhone,
          r.leadSubmittedAt ? `submitted ${fmtDate(r.leadSubmittedAt)}` : null,
          r.moveIn ? `move-in ${fmtMoveIn(r.moveIn)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      render: (r) => {
        const dates = [
          r.leadSubmittedAt ? `Submitted ${fmtDate(r.leadSubmittedAt)}` : null,
          r.moveIn ? `Move-in ${fmtMoveIn(r.moveIn)}` : null,
        ].filter(Boolean);
        if (!r.leadName && !r.leadEmail && !r.leadPhone && dates.length === 0) return <span className="text-slate-300">—</span>;
        return (
          <div className="max-w-[230px]">
            {r.leadName && <div className="truncate text-slate-700">{r.leadName}</div>}
            {(r.leadEmail || r.leadPhone) && <div className="truncate text-xs text-slate-400">{r.leadEmail || r.leadPhone}</div>}
            {dates.length > 0 && <div className="truncate text-xs text-slate-500">{dates.join(" · ")}</div>}
          </div>
        );
      },
    },
    {
      key: "source",
      header: "Source / agent",
      sortable: true,
      sortValue: (r) => (r.acquisitionSource ?? "").toLowerCase(),
      filter: { type: "select", value: (r) => r.acquisitionSource ?? "" },
      exportValue: (r) => [r.acquisitionSource, r.agentName].filter(Boolean).join(" · "),
      render: (r) =>
        r.acquisitionSource || r.agentName ? (
          <div className="max-w-[160px]">
            {r.acquisitionSource && <div className="truncate text-slate-600">{r.acquisitionSource}</div>}
            {r.agentName && <div className="truncate text-xs text-slate-400">{r.agentName}</div>}
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "prescreen",
      header: "Pre-screen",
      sortable: true,
      sortValue: (r) => (r.leadQualified == null ? 2 : r.leadQualified ? 0 : 1),
      filter: {
        type: "select",
        value: (r) => (r.leadQualified == null ? "(unknown)" : r.leadQualified ? "Qualified" : "Not qualified"),
      },
      exportValue: (r) => [r.leadQualified == null ? "" : r.leadQualified ? "Qualified" : "Not qualified", r.leadComments ?? ""].filter(Boolean).join(" · "),
      render: (r) => {
        if (r.leadQualified == null && !hasPrescreen(r)) return <span className="text-slate-300">—</span>;
        return (
          <div className="max-w-[240px] space-y-0.5">
            {qualifiedPill(r.leadQualified)}
            {r.leadComments && (
              <div className="truncate text-xs text-slate-500" title={r.leadComments}>
                {r.leadComments}
              </div>
            )}
            {hasPrescreen(r) && (
              <button
                type="button"
                aria-label={`Pre-screen for ${r.leadName ?? "lead"}`}
                onClick={() => setPrescreenFor(r)}
                className="text-[11px] font-medium text-brand-600 hover:underline"
              >
                Details
              </button>
            )}
          </div>
        );
      },
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
    <>
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) =>
        `${r.address} ${r.leadName ?? ""} ${r.leadEmail ?? ""} ${r.leadPhone ?? ""} ${r.agentName ?? ""} ${r.acquisitionSource ?? ""} ${r.leadComments ?? ""}`
      }
      searchPlaceholder="Search address, lead, agent…"
      exportName="Showings"
      facets={facets}
      initialSort={{ key: "when", dir: "asc" }}
      initialFacets={{ window: "upcoming" }}
      scrollBox
    />
    {prescreenFor && <PrescreenModal r={prescreenFor} onClose={() => setPrescreenFor(null)} />}
    </>
  );
}
