"use client";

import { useEffect, useState } from "react";
import type {
  InspectionMeta,
  InspectionProperty,
  SpecialInstruction,
} from "@/lib/inspections/types";

export function InstructionsManager() {
  const [properties, setProperties] = useState<InspectionProperty[]>([]);
  const [instructions, setInstructions] = useState<SpecialInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inspections/meta");
      if (!res.ok) throw new Error("Could not load.");
      const d: InspectionMeta = await res.json();
      setProperties(d.properties);
      setInstructions(d.specialInstructions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function addInstruction() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/inspections/special-instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Add failed.");
      return;
    }
    setNewName("");
    load();
  }

  async function saveAssignments(id: number, propertyIds: number[], name?: string) {
    const res = await fetch("/api/inspections/special-instructions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, property_ids: propertyIds, name }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setOpenId(null);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this instruction? It will be removed from all houses.")) return;
    const res = await fetch(`/api/inspections/special-instructions?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Delete failed.");
      return;
    }
    load();
  }

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New instruction (e.g. Water plants)"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          onKeyDown={(e) => e.key === "Enter" && addInstruction()}
        />
        <button
          onClick={addInstruction}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Add
        </button>
      </div>

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {instructions.length === 0 && (
          <div className="p-4 text-sm text-slate-400">No instructions yet.</div>
        )}
        {instructions.map((si) => (
          <InstructionRow
            key={si.id}
            instruction={si}
            properties={properties}
            open={openId === si.id}
            onToggle={() => setOpenId(openId === si.id ? null : si.id)}
            onSave={saveAssignments}
            onDelete={() => remove(si.id)}
          />
        ))}
      </div>
    </div>
  );
}

function InstructionRow({
  instruction,
  properties,
  open,
  onToggle,
  onSave,
  onDelete,
}: {
  instruction: SpecialInstruction;
  properties: InspectionProperty[];
  open: boolean;
  onToggle: () => void;
  onSave: (id: number, propertyIds: number[], name?: string) => void;
  onDelete: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(instruction.property_ids));
  const [name, setName] = useState(instruction.name);

  useEffect(() => {
    setSelected(new Set(instruction.property_ids));
    setName(instruction.name);
  }, [instruction]);

  const count = instruction.property_ids.length;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{instruction.name}</div>
          <div className="text-xs text-slate-400">
            {count === 0 ? "Not assigned to any house" : `${count} house${count === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {open ? "Close" : "Edit houses"}
          </button>
          <button
            onClick={onDelete}
            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <div className="mb-3 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {properties.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                <span className="truncate">{p.name || p.address}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => onSave(instruction.id, Array.from(selected), name.trim() || undefined)}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
