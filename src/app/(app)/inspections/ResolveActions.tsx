"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resolution = {
  status: string | null; // '' | 'resolved' | 'work_order'
  note: string | null;
  resolvedAt: string | null;
  workOrderRef: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PRIORITIES = [
  { id: 1, label: "Low" },
  { id: 2, label: "Medium" },
  { id: 3, label: "High" },
];

export function ResolveActions({
  id,
  resolution,
  defaultDescription,
  hasRentvineProperty,
}: {
  id: number;
  resolution: Resolution;
  defaultDescription: string;
  hasRentvineProperty: boolean;
}) {
  const router = useRouter();
  const [res, setRes] = useState<Resolution>(resolution);
  const [mode, setMode] = useState<"" | "resolve" | "work_order">("");
  const [note, setNote] = useState("");
  const [description, setDescription] = useState(defaultDescription);
  const [priorityId, setPriorityId] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/inspections/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Something went wrong.");
        return false;
      }
      setRes({
        status: data.resolution ?? null,
        note: typeof payload.note === "string" ? (payload.note as string) : null,
        resolvedAt: new Date().toISOString(),
        workOrderRef: data.workOrderRef ?? null,
      });
      setMode("");
      setNote("");
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  // Already handled — show the outcome + a reopen option.
  if (res.status === "resolved" || res.status === "work_order") {
    const isWO = res.status === "work_order";
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-emerald-800">
              {isWO
                ? `🔧 Work order created${res.workOrderRef ? ` — #${res.workOrderRef}` : ""}`
                : "✓ Marked resolved"}
            </div>
            {res.resolvedAt && (
              <div className="text-xs text-emerald-700">{fmt(res.resolvedAt)}</div>
            )}
            {res.note && <p className="mt-1 whitespace-pre-line text-sm text-emerald-900">{res.note}</p>}
          </div>
          <button
            onClick={() => post({ action: "reopen" })}
            disabled={busy}
            className="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {busy ? "…" : "Reopen"}
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-amber-800">
          This inspection needs attention. How was it handled?
        </span>
        {mode === "" && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode("resolve")}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Mark resolved
            </button>
            <button
              onClick={() => setMode("work_order")}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create work order
            </button>
          </div>
        )}
      </div>

      {mode === "resolve" && (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note (what was done)…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setMode("")}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => post({ action: "resolved", note })}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Mark resolved"}
            </button>
          </div>
        </div>
      )}

      {mode === "work_order" && (
        <div className="mt-3 space-y-3">
          {!hasRentvineProperty && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              This inspection&apos;s property isn&apos;t linked to Rentvine, so a work order
              can&apos;t be created.
            </div>
          )}
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Description (sent to Rentvine)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="block max-w-[12rem]">
            <span className="text-xs font-medium text-slate-500">Priority</span>
            <select
              value={priorityId}
              onChange={(e) => setPriorityId(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode("")}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => post({ action: "work_order", description, priorityId, note })}
              disabled={busy || !hasRentvineProperty || !description.trim()}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create work order in Rentvine"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
    </div>
  );
}
