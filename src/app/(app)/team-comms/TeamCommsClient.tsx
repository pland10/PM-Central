"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

// Internal team chatter (RingCentral Team Messaging), kept separate from the
// owner/tenant Search. Reuses the Search API with scope=internal, which only
// returns the internal pipelines.

type Attachment = {
  name?: string | null;
  type?: string | null;
  url?: string | null;
  isImage?: boolean;
  size?: number | null;
};

type ChatRow = {
  id: string;
  subject: string | null; // channel / DM name
  content: string | null;
  direction: string | null;
  deal_name: string | null;
  contact_names: string | null; // author
  ls_link: string | null;
  created_at: string | null;
  attachments: Attachment[] | null;
};

const PAGE_SIZES = [20, 40, 60, 100];

// A distinct, stable badge color per channel. Hashed from the channel name so
// each channel (and each person's DM) always lands on the same color without
// any configuration. Full literal class strings so Tailwind keeps them.
const CHANNEL_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
  "bg-lime-100 text-lime-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-blue-100 text-blue-700",
];

function channelClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHANNEL_COLORS[h % CHANNEL_COLORS.length];
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The content is stored as "<message>\n\nFrom: <author>"; the author is shown
// separately, so strip that trailing line from the displayed body.
function messageBody(content: string | null): string {
  if (!content) return "";
  return content.replace(/\n\nFrom: .*$/s, "").trim();
}

export function TeamCommsClient() {
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("");
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<ChatRow[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ updatedAt?: string; stuck?: boolean; detail?: string }>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const seq = useRef(0);

  const run = useCallback(
    async (toPage: number) => {
      const mySeq = ++seq.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          scope: "internal",
          types: "chat",
          q,
          dir,
          page: String(toPage),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (mySeq !== seq.current) return;
        if (!res.ok) {
          setError(data?.error || "Could not load team comms.");
          setRows([]);
          setCount(0);
          return;
        }
        setRows(data.rows || []);
        setCount(data.count);
        setPage(toPage);
      } catch {
        if (mySeq !== seq.current) return;
        setError("Could not reach team comms.");
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [q, dir, pageSize]
  );

  // Re-run on filter change (keyword runs on Enter / the Search button).
  useEffect(() => {
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, pageSize]);

  useEffect(() => {
    fetch("/api/team-comms/status")
      .then((r) => r.json())
      .then((d) => setFresh(d || {}))
      .catch(() => {});
  }, []);

  const totalPages = count != null ? Math.max(1, Math.ceil(count / pageSize)) : null;
  const freshColor = fresh.stuck ? "text-red-600" : "text-emerald-600";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Comms</h1>
          <p className="mt-1 text-sm text-slate-500">
            Internal team messages from RingCentral — channels and direct messages. Searchable so
            nothing anyone asks falls through the cracks.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/team-comms/capture" className="text-xs font-medium text-brand-600 hover:underline">
            ⚙ Capture settings
          </Link>
          {fresh.updatedAt && (
            <div className={`text-xs font-medium ${freshColor}`} title={fresh.detail || ""}>
              ● {fresh.stuck ? fresh.detail || "sync stuck" : `Updated ${timeAgo(fresh.updatedAt)}`}
            </div>
          )}
        </div>
      </div>

      {/* Keyword */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(1);
          }}
          placeholder="Search channels, people, messages…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          onClick={() => run(1)}
          className="shrink-0 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Search
        </button>
      </div>

      {/* Direction + per page */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
        >
          <option value="">Everyone</option>
          <option value="inbound">From others</option>
          <option value="outbound">From me</option>
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

      {/* Count */}
      <div className="mt-4 text-sm text-slate-500">
        {loading
          ? "Loading…"
          : error
          ? ""
          : count != null
          ? `${count.toLocaleString()} message${count === 1 ? "" : "s"}`
          : `${rows.length} shown`}
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Results */}
      <div className="mt-3 space-y-2">
        {!loading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No messages.
          </div>
        )}
        {rows.map((r) => {
          const channel = r.subject || r.deal_name || "Chat";
          const body = messageBody(r.content);
          const isOpen = expanded.has(r.id);
          const longish = body.length > 160 || body.includes("\n");
          return (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className={`inline-flex rounded px-1.5 py-0.5 font-medium ${channelClass(channel)}`}>
                  {channel}
                </span>
                {r.direction && (
                  <span className="text-slate-400">
                    {r.direction === "outbound" ? "from me" : "inbound"}
                  </span>
                )}
                <span className="ml-auto text-slate-400">{fmtDateTime(r.created_at)}</span>
                {r.ls_link && (
                  <a
                    href={r.ls_link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-brand-600 hover:underline"
                  >
                    RingCentral ↗
                  </a>
                )}
              </div>
              {r.contact_names && (
                <div className="text-sm font-medium text-slate-800">{r.contact_names}</div>
              )}
              {body && (
                <>
                  <div
                    className={
                      isOpen
                        ? "mt-1 whitespace-pre-wrap text-sm text-slate-600"
                        : "mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600"
                    }
                  >
                    {body}
                  </div>
                  {longish && (
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                      className="mt-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {isOpen ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              )}
              {r.attachments && r.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.attachments.map((a, i) =>
                    !a.url ? null : a.isImage ? (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        title={a.name || "image"}
                        className="relative block h-24 w-24 overflow-hidden rounded border border-slate-200 bg-slate-100"
                      >
                        <Image
                          src={a.url}
                          alt={a.name || "Shared image"}
                          fill
                          sizes="96px"
                          quality={65}
                          className="object-cover transition-transform hover:scale-105"
                        />
                      </a>
                    ) : (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600"
                      >
                        <span aria-hidden>📎</span>
                        <span className="max-w-[200px] truncate">{a.name || "file"}</span>
                        {a.size ? <span className="text-slate-400">· {fmtSize(a.size)}</span> : null}
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
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
