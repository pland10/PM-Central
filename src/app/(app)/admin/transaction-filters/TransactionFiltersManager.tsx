"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HideRule } from "@/lib/transaction-filters";

const API = "/api/admin/transaction-filters";

// Add / edit / remove the Transactions hide filters. Every filter needs a
// comment saying why it exists.
export function TransactionFiltersManager({ initialRules }: { initialRules: HideRule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [pattern, setPattern] = useState("");
  const [comment, setComment] = useState("");
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
    const body = { pattern: pattern.trim(), comment: comment.trim() };
    if (await call(API, { method: "POST", body: JSON.stringify(body) })) {
      setPattern("");
      setComment("");
      router.refresh(); // pick up the new row's id
      if (!rules.some((r) => r.pattern === body.pattern)) {
        setRules((prev) => [...prev, { id: 0, ...body, createdBy: "", createdAt: null }]);
      }
    }
    setBusy(false);
  }

  async function saveComment(rule: HideRule, value: string) {
    const v = value.trim();
    if (!v || v === rule.comment) return;
    if (await call(`${API}?id=${rule.id}`, { method: "PATCH", body: JSON.stringify({ comment: v }) })) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, comment: v } : r)));
    }
  }

  async function remove(rule: HideRule) {
    if (await call(`${API}?id=${rule.id}`, { method: "DELETE" })) {
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    }
  }

  const input = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Pattern
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="*CSG FORTE*" className={`${input} w-56`} />
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Comment (why hide these?)
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Rentvine ACH processing fees" className={input} />
        </label>
        <button
          type="submit"
          disabled={busy || !pattern.trim() || !comment.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add filter
        </button>
      </form>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No filters yet — every transaction shows.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Comment</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id || r.pattern} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.pattern}</td>
                  <td className="px-3 py-2">
                    <textarea
                      key={`${r.id}-${r.comment}`}
                      aria-label={`comment for ${r.pattern}`}
                      defaultValue={r.comment}
                      rows={1}
                      onBlur={(e) => saveComment(r, e.target.value)}
                      className={`${input} w-full min-w-[14rem] resize-y`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                    {r.createdBy || "—"}
                    {r.createdAt && <div>{new Date(r.createdAt).toLocaleDateString("en-US")}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={!r.id}
                      aria-label={`Remove ${r.pattern}`}
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
