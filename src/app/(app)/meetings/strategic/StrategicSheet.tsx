"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TOPIC_STATUSES, TOPIC_STATUS_LABELS, tuesdayOf } from "@/lib/meetings";

export type StrategicTopic = {
  id: number;
  title: string;
  status: string;
  note: string;
  lastNote: { date: string; body: string } | null;
};
export type StrategicSection = { id: number; title: string; topics: StrategicTopic[] };

type SaveState = "saving" | "saved" | "error" | undefined;

const COLLAPSE_KEY = "pmi.strategicCollapsed";

const STATUS_STYLE: Record<string, string> = {
  open: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function StrategicSheet({
  header,
  date,
  dateOptions,
  sections,
  canManage,
}: {
  header?: ReactNode;
  date: string;
  dateOptions: string[];
  sections: StrategicSection[];
  canManage: boolean;
}) {
  const router = useRouter();
  const currentTuesday = tuesdayOf(new Date());
  const allTopics = sections.flatMap((s) => s.topics);
  const seed = Object.fromEntries(allTopics.map((t) => [t.id, t.note]));
  const [notes, setNotes] = useState<Record<number, string>>(seed);
  const [saved, setSaved] = useState<Record<number, SaveState>>({});
  const [statuses, setStatuses] = useState<Record<number, string>>(
    Object.fromEntries(allTopics.map((t) => [t.id, t.status || "open"]))
  );
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed(id: number) {
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function changeStatus(id: number, status: string) {
    const prev = statuses[id];
    setStatuses((s) => ({ ...s, [id]: status })); // optimistic
    try {
      const res = await fetch("/api/meetings/topic-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setStatuses((s) => ({ ...s, [id]: prev })); // revert
    }
  }

  async function saveNote(id: number) {
    if ((notes[id] ?? "") === (seed[id] ?? "")) return;
    setSaved((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch("/api/meetings/topic-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: id, date, body: notes[id] ?? "" }),
      });
      if (!res.ok) throw new Error();
      seed[id] = notes[id] ?? "";
      setSaved((s) => ({ ...s, [id]: "saved" }));
    } catch {
      setSaved((s) => ({ ...s, [id]: "error" }));
    }
  }

  const renderTopic = (t: StrategicTopic) => (
    <li key={t.id} className="py-3">
      <div className="flex items-center justify-between gap-2">
        <div className={`text-sm font-medium ${statuses[t.id] === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {t.title}
        </div>
        <select
          aria-label={`Status for ${t.title}`}
          value={statuses[t.id] ?? "open"}
          onChange={(e) => changeStatus(t.id, e.target.value)}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none ${
            STATUS_STYLE[statuses[t.id] ?? "open"] ?? STATUS_STYLE.open
          }`}
        >
          {TOPIC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TOPIC_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        aria-label={`Notes for ${t.title}`}
        value={notes[t.id] ?? ""}
        onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
        onBlur={() => saveNote(t.id)}
        rows={2}
        placeholder="What's the latest / what did we decide?"
        className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">
          {t.lastNote ? `Last meeting (${prettyDate(t.lastNote.date)}): ${t.lastNote.body}` : "No prior note."}
        </span>
        <span className={saved[t.id] === "error" ? "text-red-600" : "text-slate-400"}>
          {saved[t.id] === "saving" ? "Saving…" : saved[t.id] === "saved" ? "Saved" : saved[t.id] === "error" ? "Couldn't save" : ""}
        </span>
      </div>
    </li>
  );

  return (
    <div>
      {/* Locked: tabs, title and the meeting-date bar stay put; the agenda scrolls. */}
      <div className="sticky top-0 z-20 pb-3" style={{ backgroundColor: "var(--background)" }}>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="font-medium">Meeting date</span>
            <select
              aria-label="Meeting date"
              value={date}
              onChange={(e) => router.push(`/meetings/strategic?date=${e.target.value}`)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {prettyDate(d)}
                  {d === currentTuesday ? " · this week" : d > currentTuesday ? " · next week" : ""}
                </option>
              ))}
            </select>
          </label>
          {canManage && (
            <Link href="/admin/meeting-topics" className="text-xs font-medium text-brand-600 hover:underline">
              Edit sections &amp; topics
            </Link>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No agenda yet.{" "}
          {canManage ? (
            <Link href="/admin/meeting-topics" className="font-medium text-brand-600 hover:underline">
              Add sections and topics
            </Link>
          ) : (
            "An admin can set up the sections and topics."
          )}
        </p>
      ) : (
        sections.map((sec) => {
          const isCollapsed = !!collapsed[sec.id];
          return (
            <section key={sec.id} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => toggleCollapsed(sec.id)}
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
                  {sec.title} <span className="text-sm font-normal text-slate-400">({sec.topics.length})</span>
                </h2>
              </button>
              {!isCollapsed &&
                (sec.topics.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No topics in this section yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100">{sec.topics.map(renderTopic)}</ul>
                ))}
            </section>
          );
        })
      )}
    </div>
  );
}
