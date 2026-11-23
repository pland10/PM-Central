"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { mondayOf } from "@/lib/meetings";

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export type MeetingRow = {
  id: string;
  label: string;
  address: string;
  active: boolean;
  tags: string;
  sortKey: string;
  note: string;
  lastNote: { date: string; body: string } | null;
  owner: string | null; // owner name(s), shown under the address
  tenants: string[]; // current tenants; none = no tenant line
  woNeeded: boolean; // "work order needed" ticked for this meeting date
};

type Filter = "all" | "active" | "inactive";
type SaveState = "saving" | "saved" | "error" | undefined;

const COLLAPSE_KEY = "pmi.meetingCollapsed";

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function MeetingSheet({
  header,
  date,
  dateOptions,
  rentals,
  squatterWatch,
  removed,
}: {
  header?: ReactNode;
  date: string;
  dateOptions: string[];
  rentals: MeetingRow[];
  squatterWatch: MeetingRow[];
  removed: MeetingRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentMonday = mondayOf(new Date());
  const [filter, setFilter] = useState<Filter>("all");
  const seed = Object.fromEntries([...rentals, ...squatterWatch].map((r) => [r.id, r.note]));
  const [notes, setNotes] = useState<Record<string, string>>(seed);
  const [saved, setSaved] = useState<Record<string, SaveState>>({});
  const [woNeeded, setWoNeeded] = useState<Record<string, boolean>>(
    Object.fromEntries([...rentals, ...squatterWatch].map((r) => [r.id, r.woNeeded]))
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed(key: string) {
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const keep = (r: MeetingRow) => filter === "all" || (filter === "active" ? r.active : !r.active);

  async function saveNote(id: string) {
    if ((notes[id] ?? "") === (seed[id] ?? "")) return; // unchanged
    setSaved((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch("/api/meetings/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id, date, body: notes[id] ?? "" }),
      });
      if (!res.ok) throw new Error();
      seed[id] = notes[id] ?? "";
      setSaved((s) => ({ ...s, [id]: "saved" }));
    } catch {
      setSaved((s) => ({ ...s, [id]: "error" }));
    }
  }

  // Tick / untick "work order needed": shows at once, saves right away, and
  // goes back if the save fails.
  async function toggleWoNeeded(id: string, needed: boolean) {
    setWoNeeded((w) => ({ ...w, [id]: needed }));
    try {
      const res = await fetch("/api/meetings/wo-needed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id, date, needed }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setWoNeeded((w) => ({ ...w, [id]: !needed }));
      setSaved((s) => ({ ...s, [id]: "error" }));
    }
  }

  async function setRemoved(id: string, removedFlag: boolean) {
    try {
      const res = await fetch("/api/meetings/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id, removed: removedFlag }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      /* leave the row as-is; the server stays the source of truth */
    }
  }

  // Plain render helpers (NOT inner components) — a component defined inside
  // MeetingSheet would get a new identity each render and remount on every
  // keystroke, dropping textarea focus.
  const renderRow = (r: MeetingRow) => (
    <li key={r.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="sm:w-56 sm:shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          {r.label}
          {!r.active && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Inactive
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">{r.address}</div>
        {r.owner && <div className="text-xs text-slate-500">Owner: {r.owner}</div>}
        {r.tenants.length > 0 && (
          <div className="text-xs text-slate-500">
            {r.tenants.length === 1 ? "Tenant" : "Tenants"}: {r.tenants.join(", ")}
          </div>
        )}
        {/* Only inactive houses can be taken off the sheet. */}
        {!r.active && (
          <button type="button" onClick={() => setRemoved(r.id, true)} className="mt-1 text-[11px] text-slate-400 hover:text-red-600">
            Remove from list
          </button>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-start gap-3">
        <textarea
          aria-label={`Notes for ${r.label}`}
          value={notes[r.id] ?? ""}
          onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
          onBlur={() => saveNote(r.id)}
          rows={2}
          placeholder="What's going on with this house?"
          className="w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {/* Jasper's cue: a work order is needed — the details are in the note. */}
        <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 pt-1 text-[11px] font-medium text-slate-500">
          <input
            type="checkbox"
            aria-label={`Work order needed for ${r.label}`}
            checked={!!woNeeded[r.id]}
            onChange={(e) => toggleWoNeeded(r.id, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          WO needed
        </label>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">
            {r.lastNote ? `Last meeting (${prettyDate(r.lastNote.date)}): ${r.lastNote.body}` : "No prior note."}
          </span>
          <span className={saved[r.id] === "error" ? "text-red-600" : "text-slate-400"}>
            {saved[r.id] === "saving" ? "Saving…" : saved[r.id] === "saved" ? "Saved" : saved[r.id] === "error" ? "Couldn't save" : ""}
          </span>
        </div>
      </div>
    </li>
  );

  const renderSection = (key: string, title: string, rows: MeetingRow[]) => {
    const shown = rows.filter(keep);
    const isCollapsed = !!collapsed[key];
    return (
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => toggleCollapsed(key)}
          aria-expanded={!isCollapsed}
          className="flex w-full items-center gap-2 text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
            className={`text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <h2 className="text-base font-bold text-slate-900">
            {title} <span className="text-sm font-normal text-slate-400">({shown.length})</span>
          </h2>
        </button>
        {!isCollapsed &&
          (shown.length ? (
            <ul className="mt-1 divide-y divide-slate-100">{shown.map(renderRow)}</ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No houses here.</p>
          ))}
      </section>
    );
  };

  return (
    <div>
      {/* Locked: tabs, title and the meeting-date bar stay put; the houses scroll. */}
      <div className="sticky top-0 z-20 pb-3" style={{ backgroundColor: "var(--background)" }}>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="font-medium">Meeting date</span>
            <select
              aria-label="Meeting date"
              value={date}
              disabled={isPending}
              onChange={(e) => {
                const v = e.target.value;
                startTransition(() => router.push(`/meetings?date=${v}`));
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {prettyDate(d)}
                  {d === currentMonday ? " · this week" : d > currentMonday ? " · next week" : ""}
                </option>
              ))}
            </select>
            {isPending && (
              <span className="flex items-center gap-1 text-xs text-slate-400" role="status">
                <Spinner /> Loading…
              </span>
            )}
          </label>
          <div className="flex items-center gap-1 text-xs">
            {(["all", "active", "inactive"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize ${
                  filter === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dim while the next date loads, so the switch is obviously happening. */}
      <div className="transition-opacity" style={{ opacity: isPending ? 0.5 : 1 }} aria-busy={isPending}>
        {renderSection("rentals", "Rental Units", rentals)}
        {renderSection("squatter", "Squatter Watch", squatterWatch)}

        {removed.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Removed from the list ({removed.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {removed.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {r.label} <span className="text-xs text-slate-400">{r.address}</span>
                </span>
                <button type="button" onClick={() => setRemoved(r.id, false)} className="text-xs font-medium text-brand-600 hover:underline">
                  Put back
                </button>
              </li>
            ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
