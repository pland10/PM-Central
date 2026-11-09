"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreventivePattern } from "@/lib/preventive";

const API = "/api/admin/preventive-patterns";

// Add / remove the admin-managed preventive-maintenance keyword rules.
export function PreventivePatternsManager({ initialPatterns }: { initialPatterns: PreventivePattern[] }) {
  const router = useRouter();
  const [patterns, setPatterns] = useState(initialPatterns);
  const [pattern, setPattern] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(url: string, init: RequestInit): Promise<boolean> {
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      return false;
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { pattern: pattern.trim(), note: note.trim() };
    if (await call(API, { method: "POST", body: JSON.stringify(body) })) {
      setPattern("");
      setNote("");
      router.refresh(); // pick up the new row's id
      if (!patterns.some((p) => p.pattern.toLowerCase() === body.pattern.toLowerCase())) {
        setPatterns((prev) => [...prev, { id: 0, ...body, createdBy: "", createdAt: null }]);
      }
    }
    setBusy(false);
  }

  async function remove(p: PreventivePattern) {
    if (await call(`${API}?id=${p.id}`, { method: "DELETE" })) {
      setPatterns((prev) => prev.filter((x) => x.id !== p.id));
    }
  }

  const input = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Keyword
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. gutter cleaning" className={`${input} w-56`} />
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. seasonal, not a repair" className={input} />
        </label>
        <button
          type="submit"
          disabled={busy || !pattern.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add keyword
        </button>
      </form>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {patterns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No keywords yet — only the built-in rules and Rentvine recurring work orders are preventive.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.id || p.pattern} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.pattern}</td>
                  <td className="px-3 py-2 text-slate-600">{p.note || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                    {p.createdBy || "—"}
                    {p.createdAt && <div>{new Date(p.createdAt).toLocaleDateString("en-US")}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={!p.id}
                      aria-label={`Remove ${p.pattern}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
