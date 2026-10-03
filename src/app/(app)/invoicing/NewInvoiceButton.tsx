"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BILLING_PARTIES } from "@/config/invoicing-parties";

export function NewInvoiceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(partyKey: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing_party: partyKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create invoice.");
      router.push(`/invoicing/${data.id}/edit`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invoice.");
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Creating…" : "+ New invoice"}
      </button>
      {open && !busy && (
        <div className="absolute right-0 z-10 mt-1 w-60 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-slate-400">Send as</div>
          {Object.values(BILLING_PARTIES).map((p) => (
            <button
              key={p.key}
              onClick={() => create(p.key)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {p.label}
              <span className="ml-1 text-xs text-slate-400">({p.prefix}…)</span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="absolute right-0 mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
