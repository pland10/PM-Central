"use client";

import { useState } from "react";

type State = "idle" | "working" | "done" | "error";

export function RefreshButton({ source, disabled }: { source: string; disabled?: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("working");
    setMsg("");
    try {
      const res = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (res.ok) {
        setState("done");
        setMsg("Started");
        setTimeout(() => setState("idle"), 6000);
      } else {
        const d = await res.json().catch(() => ({}));
        setState("error");
        setMsg(d.error || `Failed (${res.status})`);
      }
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  if (disabled) {
    return <span className="text-xs text-slate-400">Not wired up yet</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {state === "done" && <span className="text-xs font-medium text-emerald-600">Started ✓</span>}
      {state === "error" && (
        <span className="max-w-[16rem] truncate text-xs text-red-600" title={msg}>
          {msg}
        </span>
      )}
      <button
        onClick={run}
        disabled={state === "working"}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {state === "working" ? "Starting…" : "Refresh"}
      </button>
    </div>
  );
}
