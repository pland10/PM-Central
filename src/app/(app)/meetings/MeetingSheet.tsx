"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type MeetingRow = {
  id: string;
  label: string;
  address: string;
  active: boolean;
  tags: string;
  sortKey: string;
  note: string;
  lastNote: { date: string; body: string } | null;
};

type Filter = "all" | "active" | "inactive";
type SaveState = "saving" | "saved" | "error" | undefined;

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function MeetingSheet({
  date,
  dateOptions,
  rentals,
  squatterWatch,
  removed,
}: {
  date: string;
  dateOptions: string[];
  rentals: MeetingRow[];
  squatterWatch: MeetingRow[];
  removed: MeetingRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const seed = Object.fromEntries([...rentals, ...squatterWatch].map((r) => [r.id, r.note]));
  const [notes, setNotes] = useState<Record<string, string>>(seed);
  const [saved, setSaved] = useState<Record<string, SaveState>>({});

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
        <button
          type="button"
          onClick={() => setRemoved(r.id, true)}
          className="mt-1 text-[11px] text-slate-400 hover:text-red-600"
        >
          Remove from list
        </button>
      </div>
      <div className="flex-1">
        <textarea
          aria-label={`Notes for ${r.label}`}
          value={notes[r.id] ?? ""}
          onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
          onBlur={() => saveNote(r.id)}
          rows={2}
          placeholder="What's going on with this house?"
          className="w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
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

  const renderSection = (title: string, rows: MeetingRow[]) => {
    const shown = rows.filter(keep);
    return (
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {title} <span className="font-normal text-slate-400">({shown.length})</span>
        </h2>
        {shown.length ? (
          <ul className="mt-1 divide-y divide-slate-100">{shown.map(renderRow)}</ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No houses here.</p>
        )}
      </section>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Meeting date</span>
          <select
            aria-label="Meeting date"
            value={date}
            onChange={(e) => router.push(`/meetings?date=${e.target.value}`)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {prettyDate(d)}
              </option>
            ))}
          </select>
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

      {renderSection("Rental Units", rentals)}
      {renderSection("Squatter Watch", squatterWatch)}

      {removed.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Removed from the list ({removed.length})
          </summary>
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
  );
}
