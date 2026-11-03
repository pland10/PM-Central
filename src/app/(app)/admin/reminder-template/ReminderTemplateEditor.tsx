"use client";

import { useState } from "react";
import { renderTemplate, type ReminderTemplate } from "@/lib/reminders";

// Sample tenant for the live preview.
const SAMPLE = { tenant: "Jordan Lee", property: "12 Oak Street, Hempstead, NY 11550", amount: 1450 };

export function ReminderTemplateEditor({ initial }: { initial: ReminderTemplate }) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reminders/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setSubject(d.template.subject);
      setBody(d.template.body);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="rt-subject">Subject</label>
        <input
          id="rt-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="rt-body">Body</label>
        <textarea
          id="rt-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-sans text-sm leading-relaxed focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Preview (sample tenant)</div>
        <div className="text-sm font-semibold text-slate-800">{renderTemplate(subject, SAMPLE)}</div>
        <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{renderTemplate(body, SAMPLE)}</div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save template"}
        </button>
        {msg && <span className={`text-sm ${msg.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
