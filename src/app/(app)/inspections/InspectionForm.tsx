"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type InspectionDetail,
  type InspectionMeta,
  type InstructionState,
  parseSpecialInstructions,
  DEFAULT_CHECKLIST,
  CHECKLIST_STATUSES,
} from "@/lib/inspections/types";

type ChecklistDraft = {
  key: string;
  label: string;
  checked: boolean;
  status: string;
  issue_notes: string;
  fixed: boolean; // part of the standard checklist (label not editable, not removable)
};

// Standard checklist for every inspection, with any saved values merged in.
function buildChecklist(initial?: InspectionDetail): ChecklistDraft[] {
  const saved = initial?.checklist ?? [];
  const byKey = new Map(saved.map((c) => [c.item_key ?? "", c]));
  const rows: ChecklistDraft[] = DEFAULT_CHECKLIST.map((d) => {
    const s = byKey.get(d.key);
    return {
      key: d.key,
      label: d.label,
      checked: s ? Boolean(s.checked) : false,
      status: s?.status ?? "",
      issue_notes: s?.issue_notes ?? "",
      fixed: true,
    };
  });
  // Any saved items that aren't part of the standard set show as extra rows.
  const defaultKeys = new Set(DEFAULT_CHECKLIST.map((d) => d.key));
  for (const c of saved) {
    if (!defaultKeys.has(c.item_key ?? "")) {
      rows.push({
        key: c.item_key ?? c.item_label ?? "",
        label: c.item_label ?? "",
        checked: Boolean(c.checked),
        status: c.status ?? "",
        issue_notes: c.issue_notes ?? "",
        fixed: false,
      });
    }
  }
  return rows;
}
type WorkDraft = { service_name: string; quantity: number; notes: string };

const STATUS_OPTIONS = ["", "Satisfactory", "Needs attention", "Issues found"];

export function InspectionForm({ initial }: { initial?: InspectionDetail }) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [meta, setMeta] = useState<InspectionMeta | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [propertyId, setPropertyId] = useState<number | "">(initial?.property_id ?? "");
  const [reason, setReason] = useState(initial?.inspection_reason ?? "");
  const [inspector, setInspector] = useState(initial?.inspector_name ?? "");
  const [date, setDate] = useState(initial?.inspection_date ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(initial?.inspection_time ?? "");
  const [status, setStatus] = useState(initial?.overall_status ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Saved instruction states (for edit) — keyed by instruction id.
  const savedStates = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const st of parseSpecialInstructions(initial?.special_instructions).states) {
      map.set(st.id, st.checked);
    }
    return map;
  }, [initial]);
  const [checkedInstr, setCheckedInstr] = useState<Record<number, boolean>>({});

  const [checklist, setChecklist] = useState<ChecklistDraft[]>(() => buildChecklist(initial));
  const [work, setWork] = useState<WorkDraft[]>(
    (initial?.work_items ?? []).map((w) => ({
      service_name: w.service_name ?? "",
      quantity: w.quantity ?? 1,
      notes: w.notes ?? "",
    }))
  );

  useEffect(() => {
    fetch("/api/inspections/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load form data."))))
      .then((d: InspectionMeta) => setMeta(d))
      .catch((e) => setLoadErr(e.message));
  }, []);

  // Instructions assigned to the selected property.
  const propertyInstructions = useMemo(() => {
    if (!meta || propertyId === "") return [];
    return meta.specialInstructions.filter((si) => si.property_ids.includes(Number(propertyId)));
  }, [meta, propertyId]);

  // Seed checked state from saved values when instructions for the property load.
  useEffect(() => {
    setCheckedInstr((prev) => {
      const next = { ...prev };
      for (const si of propertyInstructions) {
        if (next[si.id] === undefined) next[si.id] = savedStates.get(si.id) ?? false;
      }
      return next;
    });
  }, [propertyInstructions, savedStates]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (propertyId === "" || !date) {
      setError("Property and date are required.");
      return;
    }
    setSaving(true);

    const instructionStates: InstructionState[] = propertyInstructions.map((si) => ({
      id: si.id,
      name: si.name,
      checked: Boolean(checkedInstr[si.id]),
    }));

    const payload = {
      property_id: Number(propertyId),
      inspection_reason: reason,
      inspector_name: inspector,
      inspection_date: date,
      inspection_time: time,
      overall_status: status,
      notes,
      special_instructions: instructionStates.length ? JSON.stringify(instructionStates) : "",
      checklist: checklist
        .filter((c) => c.fixed || c.label.trim())
        .map((c) => ({
          key: c.key || c.label,
          label: c.label,
          checked: c.status !== "",
          status: c.status || null,
          issue_notes: c.issue_notes || null,
        })),
      work_items: work
        .filter((w) => w.service_name.trim())
        .map((w) => ({ service_name: w.service_name, quantity: w.quantity, notes: w.notes || null })),
    };

    const res = await fetch(isEdit ? `/api/inspections/${initial!.id}` : "/api/inspections", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Save failed.");
      setSaving(false);
      return;
    }
    const id = isEdit ? initial!.id : data.id;
    router.push(`/inspections/${id}`);
    router.refresh();
  }

  if (loadErr) {
    return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</div>;
  }
  if (!meta) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labeled label="Property *">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : "")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Select a property…</option>
            {meta.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.address}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Reason">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">—</option>
            {meta.reasons.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
            {reason && !meta.reasons.some((r) => r.name === reason) && (
              <option value={reason}>{reason}</option>
            )}
          </select>
        </Labeled>
        <Labeled label="Inspector">
          <input
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Labeled>
        <Labeled label="Overall status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o || "—"}
              </option>
            ))}
            {status && !STATUS_OPTIONS.includes(status) && <option value={status}>{status}</option>}
          </select>
        </Labeled>
        <Labeled label="Date *">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Labeled>
        <Labeled label="Time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Labeled>
      </div>

      {propertyId !== "" && (
        <Section
          title="Special instructions for this property"
          hint={
            propertyInstructions.length
              ? "Checked = done during this visit."
              : "No special instructions assigned to this property."
          }
        >
          {propertyInstructions.length > 0 && (
            <div className="space-y-1.5">
              {propertyInstructions.map((si) => (
                <label key={si.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(checkedInstr[si.id])}
                    onChange={(e) =>
                      setCheckedInstr((p) => ({ ...p, [si.id]: e.target.checked }))
                    }
                  />
                  {si.name}
                </label>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Work items" hint="Services to schedule from this inspection.">
        <div className="space-y-2">
          {work.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={w.service_name}
                onChange={(e) => updateWork(i, { service_name: e.target.value })}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              >
                <option value="">Select service…</option>
                {meta.services.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                {w.service_name && !meta.services.some((s) => s.name === w.service_name) && (
                  <option value={w.service_name}>{w.service_name}</option>
                )}
              </select>
              <input
                type="number"
                min={1}
                value={w.quantity}
                onChange={(e) => updateWork(i, { quantity: Number(e.target.value) || 1 })}
                className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                placeholder="Notes"
                value={w.notes}
                onChange={(e) => updateWork(i, { notes: e.target.value })}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <button type="button" onClick={() => removeWork(i)} className="px-1 text-slate-400 hover:text-red-500">
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWork((w) => [...w, { service_name: "", quantity: 1, notes: "" }])}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            + Add work item
          </button>
        </div>
      </Section>

      <Section title="Inspection checklist" hint="Mark each item OK or Issue found; add a note on any issue.">
        <div className="space-y-2">
          {checklist.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {c.fixed ? (
                <span className="w-44 shrink-0 text-sm text-slate-800">{c.label}</span>
              ) : (
                <input
                  placeholder="Item"
                  value={c.label}
                  onChange={(e) => updateCheck(i, { label: e.target.value })}
                  className="w-44 shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                />
              )}
              <select
                value={c.status}
                onChange={(e) => updateCheck(i, { status: e.target.value })}
                className={`rounded-md border px-2 py-1.5 text-sm outline-none focus:border-brand-500 ${
                  c.status === "Issue found"
                    ? "border-red-300 text-red-700"
                    : c.status === "OK"
                      ? "border-emerald-300 text-emerald-700"
                      : "border-slate-300"
                }`}
              >
                {CHECKLIST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s || "—"}
                  </option>
                ))}
              </select>
              <input
                placeholder={c.status === "Issue found" ? "Describe the issue" : "Notes"}
                value={c.issue_notes}
                onChange={(e) => updateCheck(i, { issue_notes: e.target.value })}
                className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              {!c.fixed && (
                <button
                  type="button"
                  onClick={() => removeCheck(i)}
                  className="px-1 text-slate-400 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Labeled label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </Labeled>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create inspection"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  function updateWork(i: number, patch: Partial<WorkDraft>) {
    setWork((w) => w.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeWork(i: number) {
    setWork((w) => w.filter((_, idx) => idx !== i));
  }
  function updateCheck(i: number, patch: Partial<ChecklistDraft>) {
    setChecklist((c) => c.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeCheck(i: number) {
    setChecklist((c) => c.filter((_, idx) => idx !== i));
  }
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
