"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

// Inspection photo grid. For users who can delete (the inspection's owner or an
// admin), a "Select" mode turns the tiles into a multiselect and deletes the
// chosen photos in one request. Everyone else gets the plain grid (tap to open).

type Photo = { id: number; url: string | null; original_name: string | null };

export function PhotoGallery({
  inspectionId,
  photos,
  canDelete,
}: {
  inspectionId: number;
  photos: Photo[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = photos.filter((p) => p.url);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
    setError("");
  }

  async function deleteSelected() {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} photo${n === 1 ? "" : "s"}? This can’t be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const ids = [...selected].join(",");
      const res = await fetch(`/api/inspections/${inspectionId}/photos?photoIds=${ids}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      exitSelect();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (shown.length === 0) return <p className="text-sm text-slate-400">No photos.</p>;

  return (
    <div>
      {canDelete && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!selecting ? (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-600"
            >
              Select photos
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={busy || selected.size === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : `Delete${selected.size ? ` (${selected.size})` : ""}`}
              </button>
              <button
                type="button"
                onClick={exitSelect}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <span className="text-xs text-slate-400">Tap photos to select</span>
            </>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((ph) => {
          const isSel = selected.has(ph.id);
          const tile = `group relative block overflow-hidden rounded-lg border ${
            isSel ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200"
          }`;
          const img = (
            // next/image serves a resized, compressed thumbnail for the grid
            // (full image opens on click) and lazy-loads by default, so the page
            // isn't pulling down full-size photos.
            <div className="relative h-32 w-full bg-slate-100">
              <Image
                src={ph.url!}
                alt={ph.original_name || "Inspection photo"}
                fill
                sizes="(min-width: 640px) 33vw, 50vw"
                quality={65}
                className="object-cover transition-transform group-hover:scale-105"
              />
            </div>
          );

          if (selecting) {
            return (
              <button key={ph.id} type="button" onClick={() => toggle(ph.id)} className={`${tile} text-left`}>
                {img}
                <span
                  className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                    isSel ? "bg-brand-600 text-white" : "bg-white/80 text-transparent ring-1 ring-slate-300"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          }

          return (
            <a key={ph.id} href={ph.url!} target="_blank" rel="noreferrer" className={tile}>
              {img}
            </a>
          );
        })}
      </div>
    </div>
  );
}
