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
  onChanged,
}: {
  wo: { id: string; number: string; issue: string };
  onClose: () => void;
  onAdded?: (note: WorkOrderNote, count: number) => void;
  // Fired after an edit or delete with the thread's new latest note (null when
  // empty) and count, so the list's Notes cell can stay in sync.
  onChanged?: (latest: WorkOrderNote | null, count: number) => void;
}) {
  const [notes, setNotes] = useState<WorkOrderNote[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [emailTo, setEmailTo] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [me, setMe] = useState("");
  const [canModerate, setCanModerate] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);

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
        setMe(d.me ?? "");
        setCanModerate(Boolean(d.canModerate));
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

  const canModify = (n: WorkOrderNote) =>
    canModerate || (!!me && !!n.authorEmail && me.toLowerCase() === n.authorEmail.toLowerCase());

  async function saveEdit() {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, body: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      const next = (notes ?? []).map((n) => (n.id === editing.id ? (d.note as WorkOrderNote) : n));
      setNotes(next);
      setEditing(null);
      onChanged?.(next[0] ?? null, next.length);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not save the edit." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this note? This can't be undone.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API}?id=${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      const next = (notes ?? []).filter((n) => n.id !== id);
      setNotes(next);
      if (editing?.id === id) setEditing(null);
      onChanged?.(next[0] ?? null, next.length);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Could not delete the note." });
    } finally {
      setBusy(false);
    }
  }

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
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white font-sans shadow-xl">
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
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-sans text-sm focus:border-brand-500 focus:outline-none"
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
              {notes.map((n) =>
                editing?.id === n.id ? (
                  <li key={n.id} className="rounded-md border border-brand-300 p-3">
                    <textarea
                      aria-label="Edit note"
                      value={editing.text}
                      onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                      rows={3}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-sans text-sm focus:border-brand-500 focus:outline-none"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || !editing.text.trim()}
                        onClick={saveEdit}
                        className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                        className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={n.id} className="group rounded-md border border-slate-200 p-3">
                    <p className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{n.body}</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        {n.authorName || n.authorEmail} · {when(n.createdAt)}
                        {n.editedAt && <> · edited</>}
                        {n.emailedTo && <> · emailed {n.emailedTo}</>}
                      </p>
                      {canModify(n) && (
                        <div className="flex shrink-0 gap-2 text-xs">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditing({ id: n.id, text: n.body })}
                            className="font-medium text-slate-500 hover:text-brand-600 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => remove(n.id)}
                            className="font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
