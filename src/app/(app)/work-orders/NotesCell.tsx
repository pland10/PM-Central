"use client";

import type { NoteSummary } from "@/lib/work-order-notes-db";

// The Notes cell on the work-order tables (Maintenance + Work Orders): the
// latest note and a count, or "Add note". Clicking opens the notes panel.
export function NotesCell({ summary, onOpen }: { summary?: NoteSummary; onOpen: () => void }) {
  return summary ? (
    <div className="max-w-[220px]">
      <div className="truncate text-slate-700" title={summary.latest}>
        {summary.latest}
      </div>
      <button type="button" onClick={onOpen} className="text-xs font-medium text-brand-600 hover:underline">
        {summary.count} note{summary.count === 1 ? "" : "s"}
      </button>
    </div>
  ) : (
    <button type="button" onClick={onOpen} className="whitespace-nowrap text-xs font-medium text-brand-600 hover:underline">
      Add note
    </button>
  );
}
