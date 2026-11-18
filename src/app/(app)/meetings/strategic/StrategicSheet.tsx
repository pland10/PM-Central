"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type StrategicTopic = { id: number; title: string; note: string; lastNote: { date: string; body: string } | null };
export type StrategicSection = { id: number; title: string; topics: StrategicTopic[] };

type SaveState = "saving" | "saved" | "error" | undefined;

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function StrategicSheet({
  date,
  dateOptions,
  sections,
  canManage,
}: {
  date: string;
  dateOptions: string[];
  sections: StrategicSection[];
  canManage: boolean;
}) {
  const router = useRouter();
  const seed = Object.fromEntries(sections.flatMap((s) => s.topics).map((t) => [t.id, t.note]));
  const [notes, setNotes] = useState<Record<number, string>>(seed);
  const [saved, setSaved] = useState<Record<number, SaveState>>({});

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

  return (
    <div>
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
        sections.map((sec) => (
          <section key={sec.id} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{sec.title}</h2>
            {sec.topics.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No topics in this section yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {sec.topics.map((t) => (
                  <li key={t.id} className="py-3">
                    <div className="text-sm font-medium text-slate-800">{t.title}</div>
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
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
