"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// FileReader rather than Blob.text(): works everywhere, jsdom included.
function readText(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

// Home Depot Pro card charges aren't on Plaid (Citi), so they come in from the
// Pro site's "Invoices by Statement Date" CSV. Pick the file → it's upserted by
// invoice number (re-importing an overlapping file is safe) → table refreshes.
export function HdImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const csv = await readText(f);
      const res = await fetch("/api/plaid/import-hd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: d?.error || "Import failed." });
        return;
      }
      const skipped = Array.isArray(d.errors) ? d.errors.length : 0;
      setMsg({
        ok: true,
        text:
          `Home Depot: ${d.imported} new, ${d.updated} already imported` +
          (skipped ? ` · ${skipped} line${skipped === 1 ? "" : "s"} skipped` : ""),
      });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't read that file." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        aria-label="Import Home Depot Pro CSV"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title="Upload the Home Depot Pro “Invoices by Statement Date” CSV"
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {busy ? "Importing…" : "Import Home Depot"}
      </button>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
