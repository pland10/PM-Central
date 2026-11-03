"use client";

import { useId, useMemo, useState } from "react";
import type { PropertyChoice } from "@/lib/property-options";

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

// "+ New work order": creates it straight in Rentvine (nothing stored here).
// Just a property (or unit) and a description; priority defaults to Medium.
export function NewWorkOrder({ choices }: { choices: PropertyChoice[] }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ number: string; url: string | null } | null>(null);

  const byLabel = useMemo(() => new Map(choices.map((c) => [c.label.toLowerCase(), c])), [choices]);
  const choice = byLabel.get(property.trim().toLowerCase());

  function reset() {
    setProperty("");
    setDescription("");
    setPriority("Medium");
    setError("");
  }

  async function submit() {
    if (!choice) return setError("Pick a property from the list.");
    if (!description.trim()) return setError("Describe the work needed.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/work-orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: choice.propertyId, unitId: choice.unitId, description, priority }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setCreated({ number: d.number, url: d.url ?? null });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setCreated(null);
        }}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
      >
        + New work order
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-24" onClick={() => !busy && setOpen(false)}>
          <div
            role="dialog"
            aria-label="New work order"
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-base font-semibold text-slate-800">New work order</div>
            <p className="mb-4 text-xs text-slate-500">Created directly in Rentvine as Requested.</p>

            {created && (
              <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Created WO #{created.number} in Rentvine.{" "}
                {created.url && (
                  <a href={created.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                    Open it
                  </a>
                )}
                <div className="mt-1 text-xs text-emerald-700">It shows on this screen once it&apos;s in LeadSimple.</div>
              </div>
            )}

            <label className="mb-3 block text-xs text-slate-500">
              Property
              <input
                className={input}
                list={listId}
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                placeholder="Start typing an address…"
                autoFocus
              />
              <datalist id={listId}>
                {choices.map((c) => (
                  <option key={`${c.propertyId}:${c.unitId ?? ""}`} value={c.label} />
                ))}
              </datalist>
            </label>
            <label className="mb-3 block text-xs text-slate-500">
              What needs doing
              <textarea
                className={input}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Kitchen sink leaking under the cabinet"
              />
            </label>
            <label className="mb-4 block text-xs text-slate-500">
              Priority
              <select className={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>

            {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                Close
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create in Rentvine"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
