"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tuesdayOf } from "@/lib/meetings";

type Topic = { id: number; title: string };
type Section = { id: number; title: string; topics: Topic[] };

async function postJSON(url: string, method: string, body?: unknown): Promise<{ id?: number } | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => ({}))) as { id?: number };
  } catch {
    return null;
  }
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Edits the agenda for one meeting date. Every change applies from that week
// on; earlier weeks keep the agenda they had (see src/lib/meeting-topics-db.ts).
export function MeetingTopicsManager({
  initialSections,
  date,
  dateOptions,
}: {
  initialSections: Section[];
  date: string;
  dateOptions: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentTuesday = tuesdayOf(new Date());
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [newSection, setNewSection] = useState("");
  const [newTopic, setNewTopic] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  async function addSection() {
    const title = newSection.trim();
    if (!title) return;
    const r = await postJSON("/api/admin/meeting-sections", "POST", { title, date });
    if (!r?.id) return setError("Couldn't add that section.");
    setSections((s) => [...s, { id: r.id!, title, topics: [] }]);
    setNewSection("");
  }

  async function saveSectionTitle(id: number, title: string) {
    if (!title.trim()) return;
    if (!(await postJSON("/api/admin/meeting-sections", "PATCH", { id, title: title.trim(), date }))) setError("Couldn't rename that section.");
  }

  // Removing asks which weeks it's for: only this meeting, or this week and after.
  type Scope = "week" | "forward";
  const [removing, setRemoving] = useState<{ kind: "section" | "topic"; id: number; sectionId: number } | null>(null);

  async function removeSection(id: number, scope: Scope) {
    setRemoving(null);
    if (await postJSON(`/api/admin/meeting-sections?id=${id}&date=${date}&scope=${scope}`, "DELETE"))
      setSections((s) => s.filter((x) => x.id !== id));
    else setError("Couldn't remove that section.");
  }

  async function addTopic(sectionId: number) {
    const title = (newTopic[sectionId] ?? "").trim();
    if (!title) return;
    const r = await postJSON("/api/admin/meeting-topics", "POST", { sectionId, title, date });
    if (!r?.id) return setError("Couldn't add that topic.");
    setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, topics: [...x.topics, { id: r.id!, title }] } : x)));
    setNewTopic((n) => ({ ...n, [sectionId]: "" }));
  }

  async function saveTopicTitle(id: number, title: string) {
    if (!title.trim()) return;
    if (!(await postJSON("/api/admin/meeting-topics", "PATCH", { id, title: title.trim(), date }))) setError("Couldn't rename that topic.");
  }

  async function removeTopic(sectionId: number, id: number, scope: Scope) {
    setRemoving(null);
    if (await postJSON(`/api/admin/meeting-topics?id=${id}&date=${date}&scope=${scope}`, "DELETE"))
      setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, topics: x.topics.filter((t) => t.id !== id) } : x)));
    else setError("Couldn't remove that topic.");
  }

  // The "which weeks?" choice shown in place of a Remove button.
  const removeChoice = (onPick: (scope: Scope) => void) => (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="text-slate-500">Remove:</span>
      <button type="button" onClick={() => onPick("week")} className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200">
        Only this week
      </button>
      <button type="button" onClick={() => onPick("forward")} className="rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700 hover:bg-red-100">
        This week and after
      </button>
      <button type="button" onClick={() => setRemoving(null)} className="text-slate-400 hover:text-slate-600">
        Cancel
      </button>
    </span>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Meeting date</span>
          <select
            aria-label="Meeting date"
            value={date}
            disabled={isPending}
            onChange={(e) => {
              const v = e.target.value;
              startTransition(() => router.push(`/admin/meeting-topics?date=${v}`));
            }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {prettyDate(d)}
                {d === currentTuesday ? " · this week" : d > currentTuesday ? " · next week" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">
          Adds and renames apply to {prettyDate(date)} and the weeks after it; removing asks whether it&apos;s only this
          week. Earlier weeks keep their own agenda.
        </p>
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      <div className="space-y-4">
        {sections.map((sec) => (
          <section key={sec.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                aria-label={`Section name for ${sec.title}`}
                defaultValue={sec.title}
                onBlur={(e) => saveSectionTitle(sec.id, e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none"
              />
              {removing?.kind === "section" && removing.id === sec.id ? (
                removeChoice((scope) => removeSection(sec.id, scope))
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoving({ kind: "section", id: sec.id, sectionId: sec.id })}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove section
                </button>
              )}
            </div>

            <ul className="mt-3 space-y-1.5 pl-1">
              {sec.topics.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="text-slate-300">•</span>
                  <input
                    aria-label={`Topic name for ${t.title}`}
                    defaultValue={t.title}
                    onBlur={(e) => saveTopicTitle(t.id, e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
                  />
                  {removing?.kind === "topic" && removing.id === t.id ? (
                    removeChoice((scope) => removeTopic(sec.id, t.id, scope))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoving({ kind: "topic", id: t.id, sectionId: sec.id })}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center gap-2 pl-5">
              <input
                aria-label={`Add a topic to ${sec.title}`}
                value={newTopic[sec.id] ?? ""}
                onChange={(e) => setNewTopic((n) => ({ ...n, [sec.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addTopic(sec.id)}
                placeholder="Add a topic…"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
              />
              <button type="button" onClick={() => addTopic(sec.id)} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                Add topic
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-3">
        <input
          aria-label="Add a section"
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSection()}
          placeholder="New section name…"
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button type="button" onClick={addSection} className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700">
          Add section
        </button>
      </div>
    </div>
  );
}
