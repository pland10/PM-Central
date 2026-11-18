"use client";

import { useState } from "react";

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

export function MeetingTopicsManager({ initialSections }: { initialSections: Section[] }) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [newSection, setNewSection] = useState("");
  const [newTopic, setNewTopic] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  async function addSection() {
    const title = newSection.trim();
    if (!title) return;
    const r = await postJSON("/api/admin/meeting-sections", "POST", { title });
    if (!r?.id) return setError("Couldn't add that section.");
    setSections((s) => [...s, { id: r.id!, title, topics: [] }]);
    setNewSection("");
  }

  async function saveSectionTitle(id: number, title: string) {
    if (!title.trim()) return;
    if (!(await postJSON("/api/admin/meeting-sections", "PATCH", { id, title: title.trim() }))) setError("Couldn't rename that section.");
  }

  async function removeSection(id: number) {
    if (!confirm("Delete this section and all its topics (and their notes)?")) return;
    if (await postJSON(`/api/admin/meeting-sections?id=${id}`, "DELETE")) setSections((s) => s.filter((x) => x.id !== id));
    else setError("Couldn't delete that section.");
  }

  async function addTopic(sectionId: number) {
    const title = (newTopic[sectionId] ?? "").trim();
    if (!title) return;
    const r = await postJSON("/api/admin/meeting-topics", "POST", { sectionId, title });
    if (!r?.id) return setError("Couldn't add that topic.");
    setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, topics: [...x.topics, { id: r.id!, title }] } : x)));
    setNewTopic((n) => ({ ...n, [sectionId]: "" }));
  }

  async function saveTopicTitle(id: number, title: string) {
    if (!title.trim()) return;
    if (!(await postJSON("/api/admin/meeting-topics", "PATCH", { id, title: title.trim() }))) setError("Couldn't rename that topic.");
  }

  async function removeTopic(sectionId: number, id: number) {
    if (await postJSON(`/api/admin/meeting-topics?id=${id}`, "DELETE"))
      setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, topics: x.topics.filter((t) => t.id !== id) } : x)));
    else setError("Couldn't delete that topic.");
  }

  return (
    <div>
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
              <button type="button" onClick={() => removeSection(sec.id)} className="text-xs text-slate-400 hover:text-red-600">
                Delete section
              </button>
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
                  <button type="button" onClick={() => removeTopic(sec.id, t.id)} className="text-xs text-slate-400 hover:text-red-600">
                    Remove
                  </button>
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
