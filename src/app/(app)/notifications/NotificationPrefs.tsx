"use client";

import { useState } from "react";
import type { NotificationCategory } from "@/lib/notification-categories";

export function NotificationPrefs({
  categories,
  initialEnabled,
}: {
  categories: NotificationCategory[];
  initialEnabled: string[];
}) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialEnabled));
  const [error, setError] = useState("");

  async function toggle(key: string, next: boolean) {
    setError("");
    setEnabled((prev) => {
      const s = new Set(prev);
      if (next) s.add(key);
      else s.delete(key);
      return s;
    });
    try {
      const res = await fetch("/api/push/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: key, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEnabled((prev) => {
        const s = new Set(prev);
        if (next) s.delete(key);
        else s.add(key);
        return s;
      });
      setError("Couldn't save that change — reverted it.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">What to notify me about</h2>
      <p className="mt-1 text-xs text-slate-500">Applies to every device you&apos;ve enabled.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {categories.map((c) => (
          <li key={c.key} className="flex items-start justify-between gap-3 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                {c.label}
                {c.adminOnly && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Admin
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">{c.description}</div>
            </div>
            <Toggle checked={enabled.has(c.key)} label={c.label} onChange={(v) => toggle(c.key, v)} />
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-slate-300"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
