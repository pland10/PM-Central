"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PhotoUploader } from "./PhotoUploader";

// Inspection photo grid. A "Select" mode turns the tiles into a multiselect so
// anyone can select photos and download them as a zip; deleting the selected
// photos is additionally available to the inspection's owner or an admin.

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

  const allSelected = shown.length > 0 && selected.size === shown.length;
  function selectAll() {
    setSelected(allSelected ? new Set() : new Set(shown.map((p) => p.id)));
  }

  function fileNameFor(p: Photo, i: number): string {
    const base =
      p.original_name && /\.[a-z0-9]+$/i.test(p.original_name)
        ? p.original_name
        : `photo-${p.id}.jpg`;
    return `${String(i + 1).padStart(2, "0")}-${base}`.replace(/[\\/]/g, "_");
  }

  // Zip the selected photos (full-resolution originals) and download as one file.
  // Supabase URLs are cross-origin, so a plain <a download> won't save them —
  // fetch each blob and bundle it instead.
  async function downloadSelected() {
    const chosen = shown.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let ok = 0;
      for (const p of chosen) {
        try {
          const res = await fetch(p.url!);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          zip.file(fileNameFor(p, ok), await res.blob());
          ok++;
        } catch {
          /* skip a photo that won't fetch; keep the rest */
        }
      }
      if (ok === 0) throw new Error("Couldn't fetch any photos to download.");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-${inspectionId}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Upload (left) and the delete/select controls (right) share one row so
          the toolbar doesn't take two lines. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PhotoUploader inspectionId={inspectionId} />
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
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
                  onClick={selectAll}
                  disabled={busy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={downloadSelected}
                  disabled={busy || selected.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-brand-500 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working…" : `Download${selected.size ? ` (${selected.size})` : ""}`}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={busy || selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : `Delete${selected.size ? ` (${selected.size})` : ""}`}
                  </button>
                )}
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
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">No photos.</p>
      ) : (
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
      )}
    </div>
  );
}
