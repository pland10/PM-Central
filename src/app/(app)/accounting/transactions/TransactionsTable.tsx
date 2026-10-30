"use client";

import { useCallback, useMemo, useState } from "react";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";
import type { TxnRow } from "@/lib/plaid-db";
import { summarizeTransactions, type AnnotationPatch } from "@/lib/transactions-view";

// The Transactions tab table: a summary bar, then every card/bank transaction
// in a sortable/filterable DataTable with the hand-entered columns editable
// inline (reimbursable?, your own category, recorded in QuickBooks / Rentvine,
// notes). Each edit is saved on its own via PATCH /api/plaid/transactions/:id.

function prettyCategory(c: string): string {
  return c ? c.replaceAll("_", " ").toLowerCase() : "";
}

export function TransactionsTable({
  initialRows,
  accounts,
}: {
  initialRows: TxnRow[];
  accounts: string[];
}) {
  const [rows, setRows] = useState<TxnRow[]>(initialRows);
  const [error, setError] = useState("");

  // Optimistically apply the edit, then persist. On failure, warn rather than
  // silently diverging from the server.
  const save = useCallback(async (id: string, patch: AnnotationPatch) => {
    setRows((prev) => prev.map((r) => (r.transactionId === id ? { ...r, ...patch } : r)));
    try {
      const res = await fetch(`/api/plaid/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setError("");
    } catch {
      setError("A change couldn't be saved. Refresh to see what stuck.");
    }
  }, []);

  const summary = useMemo(
    () =>
      summarizeTransactions(
        rows.map((r) => ({
          amount: r.amount,
          reimbursable: r.reimbursable,
          recordedQuickbooks: r.recordedQuickbooks,
          recordedRentvine: r.recordedRentvine,
        }))
      ),
    [rows]
  );

  const columns = useMemo<Column<TxnRow>[]>(
    () => [
      {
        key: "postedDate",
        header: "Date",
        sortable: true,
        sortValue: (r) => r.postedDate ?? "",
        render: (r) => <span className="whitespace-nowrap text-slate-500">{r.postedDate || "—"}</span>,
        filter: { type: "date", value: (r) => r.postedDate },
      },
      {
        key: "accountName",
        header: "Account",
        sortable: true,
        sortValue: (r) => r.accountName,
        render: (r) => <span className="whitespace-nowrap text-slate-600">{r.accountName || "—"}</span>,
        filter: {
          type: "select",
          value: (r) => r.accountName,
          options: accounts.map((a) => ({ value: a, label: a })),
        },
      },
      {
        key: "merchantName",
        header: "Merchant",
        sortable: true,
        sortValue: (r) => r.merchantName.toLowerCase(),
        render: (r) => (
          <span className="text-slate-800">
            {r.merchantName || "—"}
            {r.pending && <span className="ml-1 text-xs text-amber-600">(pending)</span>}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category (Plaid)",
        sortable: true,
        sortValue: (r) => r.category,
        render: (r) => <span className="text-xs text-slate-400">{prettyCategory(r.category)}</span>,
        filter: { type: "select", value: (r) => r.category },
        exportValue: (r) => prettyCategory(r.category),
      },
      {
        key: "categoryOverride",
        header: "Category (yours)",
        sortable: true,
        sortValue: (r) => r.categoryOverride.toLowerCase(),
        exportValue: (r) => r.categoryOverride,
        render: (r) => (
          <input
            key={`cat-${r.transactionId}-${r.categoryOverride}`}
            aria-label={`category-${r.transactionId}`}
            defaultValue={r.categoryOverride}
            placeholder="—"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== r.categoryOverride) save(r.transactionId, { categoryOverride: v });
            }}
            className="w-28 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500"
          />
        ),
      },
      {
        key: "reimbursable",
        header: "Reimbursable?",
        sortable: true,
        sortValue: (r) => r.reimbursable ?? "",
        exportValue: (r) => (r.reimbursable === "yes" ? "Yes" : r.reimbursable === "no" ? "No" : ""),
        render: (r) => (
          <select
            aria-label={`reimbursable-${r.transactionId}`}
            value={r.reimbursable ?? ""}
            onChange={(e) =>
              save(r.transactionId, {
                reimbursable: e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : null,
              })
            }
            className={`rounded border px-1.5 py-1 text-xs outline-none focus:border-brand-500 ${
              r.reimbursable === "yes"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : r.reimbursable === "no"
                  ? "border-slate-200 bg-white text-slate-500"
                  : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ),
      },
      {
        key: "recordedQuickbooks",
        header: "In QuickBooks",
        align: "right",
        sortable: true,
        sortValue: (r) => (r.recordedQuickbooks ? 1 : 0),
        exportValue: (r) => (r.recordedQuickbooks ? "Yes" : "No"),
        render: (r) => (
          <input
            type="checkbox"
            aria-label={`quickbooks-${r.transactionId}`}
            checked={r.recordedQuickbooks}
            onChange={(e) => save(r.transactionId, { recordedQuickbooks: e.target.checked })}
            className="h-4 w-4 accent-brand-500"
          />
        ),
      },
      {
        key: "recordedRentvine",
        header: "In Rentvine",
        align: "right",
        sortable: true,
        sortValue: (r) => (r.recordedRentvine ? 1 : 0),
        exportValue: (r) => (r.recordedRentvine ? "Yes" : "No"),
        render: (r) => (
          <input
            type="checkbox"
            aria-label={`rentvine-${r.transactionId}`}
            checked={r.recordedRentvine}
            onChange={(e) => save(r.transactionId, { recordedRentvine: e.target.checked })}
            className="h-4 w-4 accent-brand-500"
          />
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        sortable: true,
        sortValue: (r) => r.amount,
        exportValue: (r) => r.amount,
        filter: { type: "number", value: (r) => r.amount },
        render: (r) => (
          <span className={`tabular-nums ${r.amount < 0 ? "text-emerald-700" : "text-slate-800"}`}>
            {formatCurrency(r.amount)}
          </span>
        ),
      },
      {
        key: "notes",
        header: "Notes",
        exportValue: (r) => r.notes,
        render: (r) => (
          <input
            key={`notes-${r.transactionId}-${r.notes}`}
            aria-label={`notes-${r.transactionId}`}
            defaultValue={r.notes}
            placeholder="—"
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== r.notes) save(r.transactionId, { notes: v });
            }}
            className="w-40 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500"
          />
        ),
      },
    ],
    [save, accounts]
  );

  const facets = useMemo<Facet<TxnRow>[]>(
    () => [
      {
        key: "reimbursable",
        label: "Reimbursable",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "unreviewed", label: "Unreviewed" },
        ],
        match: (r, v) => (v === "unreviewed" ? r.reimbursable == null : r.reimbursable === v),
      },
      {
        key: "qb",
        label: "In QuickBooks",
        options: [
          { value: "yes", label: "Recorded" },
          { value: "no", label: "Not yet" },
        ],
        match: (r, v) => r.recordedQuickbooks === (v === "yes"),
      },
      {
        key: "rv",
        label: "In Rentvine",
        options: [
          { value: "yes", label: "Recorded" },
          { value: "no", label: "Not yet" },
        ],
        match: (r, v) => r.recordedRentvine === (v === "yes"),
      },
    ],
    []
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Transactions" value={String(summary.count)} />
        <SummaryTile label="Total spend" value={formatCurrency(summary.totalSpend)} />
        <SummaryTile
          label="Reimbursable"
          value={formatCurrency(summary.reimbursableTotal)}
          hint={`${summary.reimbursableCount} flagged`}
          tone="emerald"
        />
        <SummaryTile
          label="Unreviewed"
          value={String(summary.unreviewedCount)}
          tone={summary.unreviewedCount > 0 ? "amber" : "slate"}
        />
        <SummaryTile
          label="Not in QuickBooks"
          value={String(summary.pendingQuickbooks)}
          tone={summary.pendingQuickbooks > 0 ? "amber" : "slate"}
        />
        <SummaryTile
          label="Not in Rentvine"
          value={String(summary.pendingRentvine)}
          tone={summary.pendingRentvine > 0 ? "amber" : "slate"}
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <DataTable<TxnRow>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.transactionId}
        search={(r) => `${r.merchantName} ${r.name} ${r.accountName} ${r.categoryOverride} ${r.notes}`}
        searchPlaceholder="Search merchant, notes…"
        facets={facets}
        initialSort={{ key: "postedDate", dir: "desc" }}
        exportName="Transactions"
      />
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  slate: "text-slate-800",
};

function SummaryTile({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`mt-1 block text-xl font-semibold ${TONES[tone]}`}>{value}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}
