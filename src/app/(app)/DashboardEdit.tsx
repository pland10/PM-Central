"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Shared "rearrange mode" state for the dashboard: the header button toggles it,
// the panel grid reacts to it. A tiny context so the two (which live in
// different parts of the page) stay in sync.

type EditCtx = { editing: boolean; toggle: () => void };
const Ctx = createContext<EditCtx>({ editing: false, toggle: () => {} });

export function DashboardEditProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return <Ctx.Provider value={{ editing, toggle: () => setEditing((e) => !e) }}>{children}</Ctx.Provider>;
}

export const useDashboardEdit = () => useContext(Ctx);

// Header toggle: "Rearrange" → "Done".
export function RearrangeButton() {
  const { editing, toggle } = useDashboardEdit();
  return (
    <button
      onClick={toggle}
      title={editing ? "Finish rearranging" : "Rearrange the dashboard panels"}
      className={
        editing
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brand-500 bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          : "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-600"
      }
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="6" r="1.6" />
        <circle cx="16" cy="6" r="1.6" />
        <circle cx="8" cy="12" r="1.6" />
        <circle cx="16" cy="12" r="1.6" />
        <circle cx="8" cy="18" r="1.6" />
        <circle cx="16" cy="18" r="1.6" />
      </svg>
      {editing ? "Done" : "Rearrange"}
    </button>
  );
}
