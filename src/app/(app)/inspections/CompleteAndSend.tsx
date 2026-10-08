"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Photo = { id: number; url: string | null; original_name: string | null };

function fmtSent(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CompleteAndSend({
  id,
  photos,
  sentAt: initialSentAt,
}: {
  id: number;
  photos: Photo[];
  sentAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(photos.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt);

  function toggle(pid: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${id}/send-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send summary.");
        return;
      }
      setSentAt(data.sentAt || new Date().toISOString());
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {sentAt ? "Re-send summary" : "Complete & send"}
      </button>
      {sentAt && <span className="text-[11px] text-slate-400">Summary sent {fmtSent(sentAt)}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">Send inspection summary</h2>
            <p className="mt-1 text-sm text-slate-500">
              Emails a summary (details, checklist, work items) to the inspections inbox. Choose
              which photos to attach.
            </p>

            {photos.length === 0 ? (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
                No photos on this inspection — the summary will be sent without attachments.
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    {selected.size} of {photos.length} selected
                  </span>
                  <div className="flex gap-3 text-xs font-medium text-brand-600">
                    <button onClick={() => setSelected(new Set(photos.map((p) => p.id)))}>All</button>
                    <button onClick={() => setSelected(new Set())}>None</button>
                  </div>
                </div>
                <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {photos.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={`relative aspect-square overflow-hidden rounded-md border-2 ${
                          on ? "border-brand-500" : "border-transparent opacity-60"
                        }`}
                      >
                        {p.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.url}
                            alt={p.original_name || "photo"}
                            className="h-full w-full object-cover"
                          />
                        )}
                        {on && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={busy}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : `Send${selected.size ? ` (${selected.size} photo${selected.size === 1 ? "" : "s"})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
