"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function InspectionActions({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm("Delete this inspection? This can't be undone from here.")) return;
    setBusy(true);
    const res = await fetch(`/api/inspections/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Delete failed.");
      setBusy(false);
      return;
    }
    router.push("/inspections");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/inspections/${id}/edit`}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Edit
      </Link>
      <button
        onClick={del}
        disabled={busy}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
