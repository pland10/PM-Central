"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WatchedRecord } from "@/lib/receipts-db";

export type Candidate = { rentvinePropertyId: string; address: string; label: string };

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function WatchedView({ watched, candidates }: { watched: WatchedRecord[]; candidates: Candidate[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const active = watched.filter((w) => w.isActive).length;

  const taken = useMemo(() => new Set(watched.map((w) => w.rentvinePropertyId).filter(Boolean)), [watched]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return candidates
      .filter((c) => !t || c.address.toLowerCase().includes(t) || c.label.toLowerCase().includes(t))
      .slice(0, 50);
  }, [q, candidates]);

  async function call(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return false;
    }
    router.refresh();
    return true;
  }

  const add = (c: Candidate) =>
    call("/api/invoicing/watched", "POST", { address: c.address, label: c.label, rentvinePropertyId: c.rentvinePropertyId });
  const addManual = async () => {
    if (manual.trim() && (await call("/api/invoicing/watched", "POST", { address: manual }))) setManual("");
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Watched properties</h1>
          <p className="text-sm text-slate-500">
            {active} active of {watched.length} · only active properties can go on a receipt
          </p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {adding ? "Done" : "+ Add property"}
        </button>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {adding && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Rentvine properties by address or owner…" autoFocus />
          <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {hits.length === 0 ? (
              <div className="py-3 text-sm text-slate-400">Nothing matches that.</div>
            ) : (
              hits.map((c) => {
                const have = taken.has(c.rentvinePropertyId);
                return (
                  <div key={c.rentvinePropertyId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{c.address}</div>
                      <div className="truncate text-xs text-slate-400">{c.label}</div>
                    </div>
                    {have ? (
                      <span className="shrink-0 text-xs text-slate-400">already listed</span>
                    ) : (
                      <button onClick={() => add(c)} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                        Add
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-1 text-xs text-slate-500">Not a Rentvine property (e.g. a watch portfolio)? Type the address:</div>
            <div className="flex gap-2">
              <input className={input} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Street, city, state ZIP" />
              <button onClick={addManual} className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                Add address
              </button>
            </div>
          </div>
        </div>
      )}

      {watched.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Nothing in the programme yet. Add the houses being watched — only what&apos;s on this list can be put on a receipt.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Address</th>
                <th className="px-4 py-2.5 font-semibold">Owner / source</th>
                <th className="px-4 py-2.5 font-semibold">In programme</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {watched.map((w) => (
                <tr key={w.id} className={w.isActive ? "" : "text-slate-400"}>
                  <td className="px-4 py-2.5 font-medium">{w.address}</td>
                  <td className="px-4 py-2.5">
                    {w.label || "—"} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{w.source}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        w.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {w.isActive ? "active" : "not in programme"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => call(`/api/invoicing/watched/${w.id}`, "PATCH", { isActive: !w.isActive })}
                      className="mr-3 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {w.isActive ? "Remove from programme" : "Put back"}
                    </button>
                    <button
                      onClick={() =>
                        window.confirm(
                          `Delete ${w.address}? Past receipts keep the address. To just stop offering it on new receipts, use "Remove from programme".`
                        ) && call(`/api/invoicing/watched/${w.id}`, "DELETE")
                      }
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-slate-400">
            Taking a house out of the programme keeps its history on past receipts; it just stops being offered on new ones.
          </p>
        </div>
      )}
    </div>
  );
}
