"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUploader({ inspectionId }: { inspectionId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError("");
    setBusy(true);

    // Upload each file independently. One failure (e.g. a large iPhone HEIC the
    // store rejects) must NOT abort the rest of the batch — keep going, tally
    // failures, and always refresh so the ones that succeeded show up.
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const file = files[i];
      try {
        const fd = new FormData();
        fd.append("photo", file);
        const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) {
          ok++;
        } else {
          const d = await res.json().catch(() => ({}));
          failures.push(`${file.name || "photo"}: ${d.error || `HTTP ${res.status}`}`);
        }
      } catch (err) {
        failures.push(`${file.name || "photo"}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }

    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (failures.length) {
      setError(
        `Uploaded ${ok} of ${files.length}. ${failures.length} failed — ${failures[0]}` +
          (failures.length > 1 ? ` (+${failures.length - 1} more)` : "")
      );
    }
    // Always refresh so successful uploads appear, even if some failed.
    router.refresh();
  }

  const label = busy
    ? progress
      ? `Uploading ${progress.done + 1} of ${progress.total}…`
      : "Uploading…"
    : "+ Add photos";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {label}
      </button>
      {error && <span className="ml-2 text-sm text-red-600">{error}</span>}
    </div>
  );
}
