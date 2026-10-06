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
  { key: "note", label: "Note" },
  { key: "chat", label: "Chat" },
  { key: "task", label: "Task" },
  { key: "payment", label: "Payment" },
];

const TYPE_BADGE: Record<string, string> = {
  email: "bg-blue-100 text-blue-700",
  text: "bg-emerald-100 text-emerald-700",
  call: "bg-amber-100 text-amber-700",
  note: "bg-orange-100 text-orange-700",
  chat: "bg-sky-100 text-sky-700",
  task: "bg-purple-100 text-purple-700",
  payment: "bg-teal-100 text-teal-700",
};

const PAGE_SIZES = [20, 40, 60, 100];

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Autocomplete input for the "scope by" fields. Commits a value only when the
// user picks a suggestion (or clears the box), matching the standalone app.
function ScopeInput({
  field,
  placeholder,
  committed,
  onCommit,
}: {
  field: string;
  placeholder: string;
  committed: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(committed);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(committed);
  }, [committed]);

  function onInput(v: string) {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim() === "" && committed) onCommit("");
    if (v.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?field=${field}&q=${encodeURIComponent(v.trim())}`);
        const data = await res.json();
        setItems(data.items || []);
        setOpen((data.items || []).length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 150);
  }

  function pick(v: string) {
    setText(v);
    setItems([]);
    setOpen(false);
    onCommit(v);
  }

  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && items[0]) pick(items[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-brand-500 ${
          committed ? "border-brand-500 bg-brand-50" : "border-slate-300"
        }`}
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {items.map((item) => (
            <button
              key={item}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchClient() {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set(TYPES.map((t) => t.key)));
  const [dir, setDir] = useState("");
  const [pageSize, setPageSize] = useState(20);
  // Both task states active by default; when exactly one is active it filters.
  const [taskStates, setTaskStates] = useState<Set<string>>(new Set(["open", "closed"]));
  const [contact, setContact] = useState("");
  const [property, setProperty] = useState("");
  const [pipeline, setPipeline] = useState("");

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ updatedAt?: string; stuck?: boolean; detail?: string }>({});

  const seq = useRef(0);

  const taskStatus =
    taskStates.size === 1 ? [...taskStates][0] : ""; // both or none = no filter

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
          contact,
          property,
          pipeline,
          page: String(toPage),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (mySeq !== seq.current) return;
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
    [q, types, dir, taskStatus, contact, property, pipeline, pageSize]
  );

  // Re-run when a filter changes (not while typing the keyword — that's Enter).
  useEffect(() => {
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, dir, taskStatus, contact, property, pipeline, pageSize]);

  useEffect(() => {
    fetch("/api/search/status")
      .then((r) => r.json())
      .then((d) => setFresh(d || {}))
      .catch(() => {});
  }, []);

  function toggleType(key: string) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleTaskState(key: string) {
    setTaskStates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function clearAll() {
    setQ("");
    setTypes(new Set(TYPES.map((t) => t.key)));
    setDir("");
    setTaskStates(new Set(["open", "closed"]));
    setContact("");
    setProperty("");
    setPipeline("");
  }

  const totalPages = count != null ? Math.max(1, Math.ceil(count / pageSize)) : null;
  const freshColor = fresh.stuck ? "text-red-600" : "text-emerald-600";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search Communications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Full-text search across your communication history — emails, texts, calls, notes, chats, tasks and payments.
          </p>
        </div>
        {fresh.updatedAt && (
          <div className={`shrink-0 text-xs font-medium ${freshColor}`} title={fresh.detail || ""}>
            ● {fresh.stuck ? fresh.detail || "sync stuck" : `Updated ${timeAgo(fresh.updatedAt)}`}
          </div>
        )}
      </div>

      {/* Scope by */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scope by</span>
        <div className="min-w-[180px] flex-1"><ScopeInput field="contact_names" placeholder="Contact name…" committed={contact} onCommit={setContact} /></div>
        <div className="min-w-[180px] flex-1"><ScopeInput field="property_address" placeholder="Property address…" committed={property} onCommit={setProperty} /></div>
        <div className="min-w-[180px] flex-1"><ScopeInput field="pipeline_name" placeholder="Pipeline / portfolio…" committed={pipeline} onCommit={setPipeline} /></div>
        <button
          onClick={clearAll}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {/* Keyword */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(1);
          }}
          placeholder="Search within scope — keywords, phrases…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          onClick={() => run(1)}
          className="shrink-0 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Search
        </button>
      </div>

      {/* Type + direction + per page */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {TYPES.map((t) => {
          const active = types.has(t.key);
          return (
            <button
              key={t.key}
              onClick={() => toggleType(t.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400"
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
        <select
          value={pageSize}
          onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      {/* Task status (only meaningful when tasks are shown) */}
      {types.has("task") && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Task status</span>
          {[
            { key: "open", label: "Open" },
            { key: "closed", label: "Completed" },
          ].map((s) => {
            const active = taskStates.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleTaskState(s.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Count */}
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
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
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
              <span className={`inline-flex rounded px-1.5 py-0.5 font-medium capitalize ${TYPE_BADGE[r.type] ?? "bg-slate-100 text-slate-600"}`}>
                {r.type}
              </span>
              {r.direction && <span className="capitalize text-slate-400">{r.direction}</span>}
              {r.type === "task" && (
                <span className={r.completed_at ? "text-slate-400" : "text-amber-600"}>
                  {r.completed_at ? "completed" : "open"}
                </span>
              )}
              <span className="ml-auto text-slate-400">{fmtDate(r.created_at)}</span>
              {r.ls_link && (
                <a href={r.ls_link} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
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
            <div className="text-xs text-slate-500">{[r.contact_names, r.property_address].filter(Boolean).join(" · ")}</div>
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
