"use client";

export function PrintToolbar({ number }: { number: string }) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between">
      <span className="text-sm text-slate-500">Invoice {number}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.close()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
