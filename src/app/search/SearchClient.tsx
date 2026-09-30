"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ActivityRow = {
  id: string;
  type: string;
  subject: string | null;
  content: string | null;
  direction: string | null;
  deal_name: string | null;
  pipeline_name: string | null;
  contact_names: string | null;
  contact_phones: string | null;
  property_address: string | null;
  assignee_name: string | null;
  ls_link: string | null;
  completed_at: string | null;
  created_at: string | null;
};

const TYPES = [
  { key: "email", label: "Email" },
  { key: "text", label: "Text" },
  { key: "call", label: "Call" },
  { key: "task", label: "Task" },
];

const TYPE_BADGE: Record<string, string> = {
  email: "bg-blue-100 text-blue-700",
  text: "bg-emerald-100 text-emerald-700",
  call: "bg-purple-100 text-purple-700",
  task: "bg-amber-100 text-amber-700",
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SearchClient() {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set(TYPES.map((t) => t.key)));
  const [dir, setDir] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const seq = useRef(0);

  const run = useCallback(
    async (toPage: number) => {
      const mySeq = ++seq.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q,
          types: [...types].join(","),
          dir,
          taskStatus,
          page: String(toPage),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (mySeq !== seq.current) return; // a newer search already ran
        if (!res.ok) {
          setError(data?.error || "Search failed.");
          setRows([]);
          setCount(0);
          return;
        }
        setRows(data.rows || []);
        setCount(data.count);
        setPage(toPage);
      } catch {
        if (mySeq !== seq.current) return;
        setError("Could not reach search.");
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [q, types, dir, taskStatus, pageSize]
  );

  // Initial load + re-run when filters change (not while typing — that's on Enter).
  useEffect(() => {
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, dir, taskStatus]);

  function toggleType(key: string) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalPages = count != null ? Math.max(1, Math.ceil(count / pageSize)) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-slate-500">
          Full-text search across LeadSimple activity — emails, texts, calls and tasks.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(1);
          }}
          placeholder="Search deals, contacts, addresses, message text…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          onClick={() => run(1)}
          className="shrink-0 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Search
        </button>
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {TYPES.map((t) => {
          const active = types.has(t.key);
          return (
            <button
              key={t.key}
              onClick={() => toggleType(t.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <select
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
        >
          <option value="">Any direction</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        {types.has("task") && (
          <select
            value={taskStatus}
            onChange={(e) => setTaskStatus(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
          >
            <option value="">Tasks: any</option>
            <option value="open">Tasks: open</option>
            <option value="closed">Tasks: closed</option>
          </select>
        )}
      </div>

      {/* Count / status */}
      <div className="mt-4 text-sm text-slate-500">
        {loading
          ? "Searching…"
          : error
          ? ""
          : count != null
          ? `${count.toLocaleString()} result${count === 1 ? "" : "s"}`
          : `${rows.length} shown`}
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="mt-3 space-y-2">
        {!loading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No matches.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span
                className={`inline-flex rounded px-1.5 py-0.5 font-medium capitalize ${
                  TYPE_BADGE[r.type] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {r.type}
              </span>
              {r.direction && <span className="capitalize text-slate-400">{r.direction}</span>}
              {r.type === "task" && (
                <span className={r.completed_at ? "text-slate-400" : "text-amber-600"}>
                  {r.completed_at ? "closed" : "open"}
                </span>
              )}
              <span className="ml-auto text-slate-400">{fmtDate(r.created_at)}</span>
              {r.ls_link && (
                <a
                  href={r.ls_link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  LeadSimple ↗
                </a>
              )}
            </div>
            {(r.deal_name || r.pipeline_name) && (
              <div className="text-sm">
                <span className="font-medium text-slate-800">{r.deal_name || "—"}</span>
                {r.pipeline_name && <span className="ml-2 text-xs text-slate-400">{r.pipeline_name}</span>}
              </div>
            )}
            <div className="text-xs text-slate-500">
              {[r.contact_names, r.property_address].filter(Boolean).join(" · ")}
            </div>
            {(r.subject || r.content) && (
              <div className="mt-1 line-clamp-3 text-sm text-slate-600">
                {r.subject ? <span className="font-medium">{r.subject}: </span> : null}
                {r.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            disabled={page <= 1 || loading}
            onClick={() => run(page - 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-slate-500">
            Page {page}
            {totalPages ? ` of ${totalPages}` : ""}
          </span>
          <button
            disabled={loading || (totalPages != null && page >= totalPages) || rows.length < pageSize}
            onClick={() => run(page + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
