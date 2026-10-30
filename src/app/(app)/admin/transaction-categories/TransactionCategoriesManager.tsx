"use client";

import { useMemo, useState } from "react";
import { duplicateGroups, normalizeCategoryName, type CategoryUsage } from "@/lib/transaction-categories";

const API = "/api/admin/transaction-categories";
const BTN =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const byName = (a: CategoryUsage, b: CategoryUsage) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

export function TransactionCategoriesManager({
  initialCategories,
  initialOpen,
}: {
  initialCategories: CategoryUsage[];
  initialOpen: boolean;
}) {
  const [categories, setCategories] = useState(() => [...initialCategories].sort(byName));
  const [open, setOpen] = useState(initialOpen);
  const [newName, setNewName] = useState("");
  const [mergeTo, setMergeTo] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  // name → the other look-alikes it may duplicate.
  const lookAlikes = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of duplicateGroups(categories)) for (const n of g) m.set(n, g.filter((x) => x !== n));
    return m;
  }, [categories]);

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

  async function toggleOpen() {
    const next = !open;
    if (await call(API, { method: "PATCH", body: JSON.stringify({ open: next }) })) setOpen(next);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeCategoryName(newName);
    if (!name) return;
    if (await call(API, { method: "POST", body: JSON.stringify({ name }) })) {
      setNewName("");
      setCategories((prev) =>
        prev.some((c) => c.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, { name, count: 0 }].sort(byName)
      );
    }
  }

  async function merge(from: CategoryUsage) {
    const to = mergeTo[from.name];
    if (!to) return;
    if (await call(`${API}/merge`, { method: "POST", body: JSON.stringify({ from: from.name, to }) })) {
      setCategories((prev) =>
        prev.filter((c) => c.name !== from.name).map((c) => (c.name === to ? { ...c, count: c.count + from.count } : c))
      );
    }
  }

  async function remove(c: CategoryUsage) {
    if (await call(`${API}?name=${encodeURIComponent(c.name)}`, { method: "DELETE" })) {
      setCategories((prev) => prev.filter((x) => x.name !== c.name));
    }
  }

  const input = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none";
  const dupCount = lookAlikes.size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={open} onChange={toggleOpen} className="h-4 w-4 accent-brand-500" />
          Anyone can add new categories
        </label>
        <span className="text-xs text-slate-500">
          {open
            ? "Typing a new category on Transactions adds it to the list."
            : "Locked — only listed categories are accepted; only admins can add new ones."}
        </span>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          New category
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Payroll" className={`${input} w-64`} />
        </label>
        <button type="submit" disabled={!newName.trim()} className={`${BTN} py-1.5`}>
          Add category
        </button>
        {dupCount > 0 && (
          <span className="ml-auto text-xs font-medium text-amber-700">{dupCount} possible duplicates to review</span>
        )}
      </form>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No categories yet — they’ll appear here as people categorize transactions.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Transactions</th>
                <th className="px-3 py-2">Merge into</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const alikes = lookAlikes.get(c.name);
                return (
                  <tr key={c.name} className={`border-t border-slate-100 ${alikes ? "bg-amber-50/60" : ""}`}>
                    <td className="px-3 py-2" aria-label={c.name}>
                      {c.name}
                      {alikes && (
                        <span className="ml-2 text-xs text-amber-700">possible duplicate of {alikes.join(", ")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.count}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label={`Merge ${c.name} into`}
                          value={mergeTo[c.name] ?? ""}
                          onChange={(e) => setMergeTo((m) => ({ ...m, [c.name]: e.target.value }))}
                          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {/* Look-alikes first, then everything else. */}
                          {[...(alikes ?? []), ...categories.map((x) => x.name).filter((n) => n !== c.name && !alikes?.includes(n))].map(
                            (n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            )
                          )}
                        </select>
                        <button type="button" disabled={!mergeTo[c.name]} onClick={() => merge(c)} className={BTN}>
                          Merge
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.count === 0 && (
                        <button type="button" aria-label={`Delete ${c.name}`} onClick={() => remove(c)} className={BTN}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
