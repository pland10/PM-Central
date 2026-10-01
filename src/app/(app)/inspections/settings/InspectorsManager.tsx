"use client";

import { useEffect, useState } from "react";
import type { Inspector } from "@/lib/inspections/types";

export function InspectorsManager() {
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inspections/inspectors");
      if (!res.ok) throw new Error("Could not load inspectors.");
      const d = await res.json();
      setInspectors(d.inspectors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(id: string) {
    const name = draft.trim();
    if (!name) return;
    const res = await fetch("/api/inspections/inspectors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setEditId(null);
    load();
  }

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <p className="text-sm text-slate-500">
        Inspectors are the people with login accounts. Rename them here; to add a new inspector,
        invite them in Supabase Authentication.
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {inspectors.length === 0 && (
          <div className="p-4 text-sm text-slate-400">No inspectors found.</div>
        )}
        {inspectors.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 p-3">
            {editId === u.id ? (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                onKeyDown={(e) => e.key === "Enter" && save(u.id)}
                autoFocus
              />
            ) : (
              <div className="min-w-0">
                <div className="font-medium text-slate-800">{u.name}</div>
                {u.email && u.email !== u.name && (
                  <div className="text-xs text-slate-400">{u.email}</div>
                )}
              </div>
            )}
            {editId === u.id ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => save(u.id)}
                  className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditId(u.id);
                  setDraft(u.name);
                }}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Rename
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
