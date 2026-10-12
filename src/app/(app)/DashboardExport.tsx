"use client";

import { useState } from "react";
import { downloadXlsx, todayStamp, type ExportSheet } from "@/lib/export-excel";

// Export button for the dashboard: downloads a single multi-sheet .xlsx
// workbook (Summary + Delinquencies + Expirations + … ) built server-side and
// passed in as plain rows.
export function DashboardExport({ sheets }: { sheets: ExportSheet[] }) {
  const [exporting, setExporting] = useState(false);

  async function run() {
    setExporting(true);
    try {
      await downloadXlsx(`PMI Dashboard ${todayStamp()}`, sheets.filter((s) => s.rows.length > 0));
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={exporting}
      title="Export the dashboard to Excel"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      {exporting ? "Exporting…" : "Export"}
    </button>
  );
}
