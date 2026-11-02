"use client";

import { useEffect, useState } from "react";
import type { StaffMember, WorkOrderNote } from "@/lib/work-order-notes";

// Notes thread for one work order (opened from the Work Orders list). Adding a
// note never emails anyone; "Add note & email" sends it to the person picked in
// "Email to" (defaults to the work order's assignee, if they use PM-Central).

const API = "/api/work-orders/notes";

function when(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function WorkOrderNotes({
  wo,
  onClose,
  onAdded,
}: {
  wo: { id: string; number: string; issue: string };
  onClose: () => void;
  onAdded?: (note: WorkOrderNote, count: number) => void;
}) {
  const [notes, setNotes] = useState<WorkOrderNote[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [emailTo, setEmailTo] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}?wo=${encodeURIComponent(wo.id)}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
        setNotes(d.notes ?? []);
        setStaff(d.staff ?? []);
        setEmailTo(d.assigneeEmail ?? "");
      } catch (e) {
        if (!cancelled) {
          setNotes([]);
          setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not load notes." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wo.id]);

  async function add(withEmail: boolean) {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withEmail ? { woId: wo.id, body: text, emailTo } : { woId: wo.id, body: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      const next = [d.note as WorkOrderNote, ...(notes ?? [])];
      setNotes(next);
      setBody("");
      onAdded?.(d.note, next.length);
      if (withEmail) {
        setMsg(
          d.emailed
            ? { tone: "ok", text: `Note added and emailed ${emailTo}.` }
            : { tone: "err", text: `Note added, but the email didn't send: ${d.emailError || "unknown error"}` }
        );
      }
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not save the note." });
    } finally {
      setBusy(false);
    }
  }

  const empty = !body.trim();
  const btn =
    "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Notes for WO #${wo.number}`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes · WO #{wo.number}</div>
            <div className="text-sm font-semibold text-slate-800">{wo.issue}</div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
            Close
          </button>
        </div>

        <div className="space-y-2 border-b border-slate-200 p-4">
          <label className="block text-xs font-medium text-slate-600" htmlFor="wo-note-body">
            New note
          </label>
          <textarea
            id="wo-note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="e.g. Owner approved — go ahead with the repair"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || empty}
              onClick={() => add(false)}
              className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}
            >
              Add note
            </button>
            <span className="text-xs text-slate-400">or</span>
            <button
              type="button"
              disabled={busy || empty || !emailTo}
              onClick={() => add(true)}
              className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Add note &amp; email
            </button>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              Email to
              <select
                aria-label="Email to"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="max-w-[11rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
              >
                <option value="">Choose…</option>
                {staff.map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {msg && (
            <p className={`text-xs ${msg.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notes === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-slate-400">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border border-slate-200 p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.authorName || n.authorEmail} · {when(n.createdAt)}
                    {n.emailedTo && <> · emailed {n.emailedTo}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
