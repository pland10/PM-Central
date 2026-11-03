"use client";

import { useState } from "react";

// One-time: shrink inspection photos already in storage (Supabase bills by
// size). Calls /api/admin/shrink-photos batch by batch until it's done.
type State =
  | { kind: "idle" }
  | { kind: "running"; checked: number; shrunk: number; saved: number; remaining: number }
  | { kind: "done"; checked: number; shrunk: number; saved: number }
  | { kind: "error"; msg: string };

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export function ShrinkPhotosButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    let after: number | null = 0;
    let checked = 0;
    let shrunk = 0;
    let saved = 0;
    setState({ kind: "running", checked, shrunk, saved, remaining: 0 });
    try {
      while (after !== null) {
        const res: Response = await fetch("/api/admin/shrink-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ after }),
        });
        const d: { checked: number; shrunk: number; savedBytes: number; next: number | null; remaining: number; error?: string } =
          await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
        checked += d.checked;
        shrunk += d.shrunk;
        saved += d.savedBytes;
        after = d.next;
        setState({ kind: "running", checked, shrunk, saved, remaining: d.remaining });
      }
      setState({ kind: "done", checked, shrunk, saved });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : "Failed" });
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-800">Shrink existing inspection photos</div>
          <div className="text-xs text-slate-500">
            One-time cleanup to cut Supabase storage. New photos are shrunk on upload automatically.
          </div>
        </div>
        <button
          onClick={run}
          disabled={state.kind === "running"}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {state.kind === "running" ? "Shrinking…" : "Shrink photos"}
        </button>
      </div>
      {state.kind === "running" && (
        <div className="mt-2 text-xs text-sky-700">
          Checked {state.checked} · shrunk {state.shrunk} · saved {mb(state.saved)}
          {state.remaining > 0 && ` · ${state.remaining} to go`}
        </div>
      )}
      {state.kind === "done" && (
        <div className="mt-2 text-xs font-medium text-emerald-600">
          Done ✓ — checked {state.checked}, shrunk {state.shrunk}, saved {mb(state.saved)}
        </div>
      )}
      {state.kind === "error" && <div className="mt-2 text-xs text-red-600">{state.msg}</div>}
    </div>
  );
}
