"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUploader({ inspectionId }: { inspectionId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("photo", file);
        const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Upload failed.");
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

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
        {busy ? "Uploading…" : "+ Add photos"}
      </button>
      {error && <span className="ml-2 text-sm text-red-600">{error}</span>}
    </div>
  );
}
