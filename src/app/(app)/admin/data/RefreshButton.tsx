"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Refresh = dispatch the source's GitHub Actions workflow, then follow that run:
// Queued… → Running… m:ss → Done ✓ (and reload the page so "Last refreshed"
// updates) or Failed (linking to the run's log).
type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; label: "Starting…" | "Queued…" | "Running…" }
  | { kind: "done" }
  | { kind: "failed"; url?: string }
  | { kind: "error"; msg: string };

const GIVE_UP_MS = 20 * 60_000; // stop watching after 20 minutes

export function RefreshButton({
  source,
  disabled,
  pollMs = 5000,
}: {
  source: string;
  disabled?: boolean;
  pollMs?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (ticker.current) clearInterval(ticker.current);
    timer.current = ticker.current = null;
  };
  useEffect(() => stop, []);

  async function run() {
    stop();
    setPhase({ kind: "starting" });
    const since = new Date(Date.now() - 5_000).toISOString();
    try {
      const res = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setPhase({ kind: "error", msg: d.error || `Failed (${res.status})` });
        return;
      }
    } catch (e) {
      setPhase({ kind: "error", msg: e instanceof Error ? e.message : "Failed" });
      return;
    }

    const startedAt = Date.now();
    setElapsed(0);
    setPhase({ kind: "waiting", label: "Starting…" });
    ticker.current = setInterval(() => setElapsed(Date.now() - startedAt), 1000);

    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/refresh/status?source=${encodeURIComponent(source)}&since=${encodeURIComponent(since)}`);
        const s = await res.json().catch(() => ({}));
        if (s.state === "success") {
          stop();
          setPhase({ kind: "done" });
          router.refresh(); // pick up the new "Last refreshed"
          return;
        }
        if (s.state === "failure") {
          stop();
          setPhase({ kind: "failed", url: s.url });
          return;
        }
        if (s.state === "queued") setPhase({ kind: "waiting", label: "Queued…" });
        if (s.state === "running") setPhase({ kind: "waiting", label: "Running…" });
      } catch {
        /* transient — keep polling */
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        stop();
        setPhase({ kind: "error", msg: "Still running — check back later." });
        return;
      }
      timer.current = setTimeout(poll, pollMs);
    };
    timer.current = setTimeout(poll, pollMs);
  }

  if (disabled) {
    return <span className="text-xs text-slate-400">Not wired up yet</span>;
  }

  const busy = phase.kind === "starting" || phase.kind === "waiting";
  const mmss = `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center justify-end gap-2">
      {phase.kind === "waiting" && (
        <span className="text-xs font-medium text-sky-700">
          {phase.label} {phase.label === "Running…" && <span className="tabular-nums text-sky-500">{mmss}</span>}
        </span>
      )}
      {phase.kind === "done" && <span className="text-xs font-medium text-emerald-600">Done ✓</span>}
      {phase.kind === "failed" &&
        (phase.url ? (
          <a href={phase.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-red-600 underline">
            Failed — view log
          </a>
        ) : (
          <span className="text-xs font-medium text-red-600">Failed</span>
        ))}
      {phase.kind === "error" && (
        <span className="max-w-[16rem] truncate text-xs text-red-600" title={phase.msg}>
          {phase.msg}
        </span>
      )}
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {phase.kind === "starting" ? "Starting…" : "Refresh"}
      </button>
    </div>
  );
}
