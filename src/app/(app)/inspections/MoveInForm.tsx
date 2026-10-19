"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InspectionDetail, InspectionMeta, MoveInMeta, MoveInRoom } from "@/lib/inspections/types";
import {
  buildMoveInSections,
  defaultRoomLabel,
  defaultRooms,
  MAX_ROOMS,
  type MoveInItem,
} from "@/lib/inspections/move-in-template";

// One answer per checklist item. For "condition"/"value" items only `note` is
// used (the note is the value for "value" items); "working" items also use
// `status` ("Yes" | "No" | "").
type Answer = { status: string; note: string };

function seedAnswers(initial?: InspectionDetail): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const c of initial?.checklist ?? []) {
    const key = c.item_key ?? "";
    if (key) out[key] = { status: c.status ?? "", note: c.issue_notes ?? "" };
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);

export function MoveInForm({ initial }: { initial?: InspectionDetail }) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const m: MoveInMeta = initial?.meta ?? {};

  const [meta, setMeta] = useState<InspectionMeta | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoMsg, setPhotoMsg] = useState("");
  const [error, setError] = useState("");

  const [propertyId, setPropertyId] = useState<number | "">(initial?.property_id ?? "");
  const [inspector, setInspector] = useState(initial?.inspector_name ?? "");
  const [date, setDate] = useState(initial?.inspection_date ?? today());
  const [tenantNames, setTenantNames] = useState(m.tenantNames ?? "");
  const [moveInDate, setMoveInDate] = useState(m.moveInDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => seedAnswers(initial));

  // Configurable rooms (1–6 each) with custom labels. Seed from saved meta, or
  // the default layout for a new inspection.
  const [bathrooms, setBathrooms] = useState<MoveInRoom[]>(
    () => m.bathrooms?.length ? m.bathrooms : defaultRooms("bath")
  );
  const [bedrooms, setBedrooms] = useState<MoveInRoom[]>(
    () => m.bedrooms?.length ? m.bedrooms : defaultRooms("bed")
  );

  function setRoomCount(kind: "bed" | "bath", n: number) {
    const setter = kind === "bed" ? setBedrooms : setBathrooms;
    setter((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      const next = [...prev];
      for (let i = prev.length; i < n; i++) {
        next.push({ id: `${kind}${i + 1}`, label: defaultRoomLabel(kind, i + 1) });
      }
      return next;
    });
  }
  function setRoomLabel(id: string, label: string) {
    const kind = id.startsWith("bath") ? "bath" : "bed";
    const setter = kind === "bed" ? setBedrooms : setBathrooms;
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  // The ordered sections (fixed + the chosen rooms, with live labels).
  const sections = buildMoveInSections({ bathrooms, bedrooms });
  const roomLabelById = new Map(
    [...bathrooms, ...bedrooms].map((r) => [r.id, r.label] as const)
  );

  // Typed signatures (name + date) for tenant and PM.
  const [tenantSigName, setTenantSigName] = useState(m.tenantSigName ?? "");
  const [tenantSigDate, setTenantSigDate] = useState(m.tenantSigDate ?? "");
  const [pmSigName, setPmSigName] = useState(m.pmSigName ?? "");
  const [pmSigDate, setPmSigDate] = useState(m.pmSigDate ?? "");

  // Photos staged on a NEW inspection (uploaded after it has an id).
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/inspections/meta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load form data."))))
      .then((d: InspectionMeta) => setMeta(d))
      .catch((e) => setLoadErr(e.message));
  }, []);

  useEffect(() => {
    if (!isEdit && meta?.me?.name && !inspector) setInspector(meta.me.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  function setAnswer(key: string, patch: Partial<Answer>) {
    setAnswers((a) => {
      const cur = a[key] ?? { status: "", note: "" };
      return { ...a, [key]: { ...cur, ...patch } };
    });
  }

  function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      setPhotos((p) => [...p, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  function removePhoto(i: number) {
    setPhotos((p) => {
      const next = [...p];
      const [rm] = next.splice(i, 1);
      if (rm) URL.revokeObjectURL(rm.url);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (propertyId === "" || !date) {
      setError("Property and date are required.");
      return;
    }
    setSaving(true);

    // Only persist items the inspector actually filled in; the rest render
    // blank from the template on the detail page.
    const checklist = sections.flatMap((section) =>
      section.items
        .map((item) => ({ item, ans: answers[item.key] }))
        .filter(({ ans }) => ans && (ans.status || ans.note.trim()))
        .map(({ item, ans }) => ({
          key: item.key,
          label: item.label,
          checked: Boolean(ans.status || ans.note.trim()),
          status: ans.status || null,
          issue_notes: ans.note.trim() || null,
        }))
    );

    const metaPayload: MoveInMeta = {
      tenantNames: tenantNames.trim() || undefined,
      moveInDate: moveInDate || undefined,
      tenantSigName: tenantSigName.trim() || undefined,
      tenantSigDate: tenantSigDate || undefined,
      pmSigName: pmSigName.trim() || undefined,
      pmSigDate: pmSigDate || undefined,
      bathrooms: bathrooms.map((r) => ({ id: r.id, label: r.label.trim() || r.id })),
      bedrooms: bedrooms.map((r) => ({ id: r.id, label: r.label.trim() || r.id })),
    };

    const payload = {
      property_id: Number(propertyId),
      inspection_reason: "Move-in",
      inspector_name: inspector,
      inspection_date: date,
      notes,
      inspection_type: "move_in",
      meta: metaPayload,
      checklist,
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

    if (!isEdit && photos.length) {
      let failed = 0;
      for (let i = 0; i < photos.length; i++) {
        setPhotoMsg(`Uploading photo ${i + 1} of ${photos.length}…`);
        try {
          const fd = new FormData();
          fd.append("photo", photos[i].file);
          const r = await fetch(`/api/inspections/${id}/photos`, { method: "POST", body: fd });
          if (!r.ok) failed++;
        } catch {
          failed++;
        }
      }
      if (failed) {
        router.push(`/inspections/${id}?photoFailed=${failed}`);
        router.refresh();
        return;
      }
    }

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
    <form onSubmit={onSubmit} className="space-y-5">
      <Section title="Move-in details">
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
          <Labeled label="Inspector">
            <select
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="">— Select inspector —</option>
              {meta.inspectors.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
              {inspector && !meta.inspectors.some((u) => u.name === inspector) && (
                <option value={inspector}>{inspector}</option>
              )}
            </select>
          </Labeled>
          <Labeled label="Tenant name(s)">
            <input
              value={tenantNames}
              onChange={(e) => setTenantNames(e.target.value)}
              placeholder="e.g. Jane Doe, John Doe"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Labeled>
          <Labeled label="Move-in date">
            <input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Labeled>
          <Labeled label="Date of inspection *">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Labeled>
          <Labeled label="Bedrooms">
            <select
              value={bedrooms.length}
              onChange={(e) => setRoomCount("bed", Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {Array.from({ length: MAX_ROOMS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Bathrooms">
            <select
              value={bathrooms.length}
              onChange={(e) => setRoomCount("bath", Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {Array.from({ length: MAX_ROOMS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Rename any bedroom or bathroom below (e.g. “Bedroom 2 — upstairs left”).
        </p>
      </Section>

      {sections.map((section) => {
        const isRoom = roomLabelById.has(section.id);
        return (
          <Section
            key={section.id}
            title={
              isRoom ? (
                <input
                  value={roomLabelById.get(section.id) ?? ""}
                  onChange={(e) => setRoomLabel(section.id, e.target.value)}
                  placeholder="Room label"
                  className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-brand-500"
                />
              ) : (
                section.title
              )
            }
            hint={section.optional ? "If applicable" : undefined}
          >
            <div className="space-y-3">
              {section.items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  answer={answers[item.key] ?? { status: "", note: "" }}
                  onChange={(patch) => setAnswer(item.key, patch)}
                />
              ))}
            </div>
          </Section>
        );
      })}

      <Section title="Additional notes / comments">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <Section title="Photos" hint="Attach photos of the unit's condition (optional).">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={addPhotos}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add photos
        </button>
        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <div
                key={i}
                className="relative h-20 w-full overflow-hidden rounded border border-slate-200 bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-0.5 top-0.5 rounded bg-black/50 px-1 text-xs leading-5 text-white hover:bg-black/70"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {isEdit && (
          <p className="mt-2 text-xs text-slate-400">
            Add or remove photos on the inspection page after saving.
          </p>
        )}
      </Section>

      <Section title="Signatures" hint="Typed name + date acknowledgment.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tenant</div>
            <input
              value={tenantSigName}
              onChange={(e) => setTenantSigName(e.target.value)}
              placeholder="Tenant name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              type="date"
              value={tenantSigDate}
              onChange={(e) => setTenantSigDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Property manager
            </div>
            <input
              value={pmSigName}
              onChange={(e) => setPmSigName(e.target.value)}
              placeholder="Manager name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              type="date"
              value={pmSigDate}
              onChange={(e) => setPmSigDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </Section>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? photoMsg || "Saving…" : isEdit ? "Save changes" : "Create move-in inspection"}
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
}

function ItemRow({
  item,
  answer,
  onChange,
}: {
  item: MoveInItem;
  answer: Answer;
  onChange: (patch: Partial<Answer>) => void;
}) {
  return (
    <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-800">{item.label}</span>
          <span className="ml-2 text-xs text-slate-400">{item.hint}</span>
        </div>
        {item.kind === "working" && (
          <div className="flex gap-1">
            {["Yes", "No"].map((v) => {
              const on = answer.status === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ status: on ? "" : v })}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${
                    on
                      ? v === "Yes"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-red-400 bg-red-50 text-red-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <input
        value={answer.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder={
          item.kind === "value"
            ? "Enter…"
            : item.kind === "working"
              ? "Condition / notes"
              : "Condition"
        }
        className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
      />
    </div>
  );
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
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
