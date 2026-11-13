"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { formatCurrencyCents } from "@/lib/format";
import type { PropertyChoice } from "@/lib/property-options";
import type { Reimbursable } from "@/lib/transactions-view";
import type { SplitLine, StoredSplitLine } from "@/lib/transaction-splits";
import { Combobox } from "@/components/Combobox";

// Split one bank/card charge into lines (like a GL entry): each line gets its
// own amount, property/unit, category and reimbursable flag; the lines must add
// up to the charge before it saves. Recorded-in-QuickBooks / Rentvine are
// ticked per line in the table afterwards (and kept when a split is edited).
// PUT /api/plaid/transactions/:id/splits; "Unsplit" DELETEs the lines.

export type EditorLine = {
  amount: string;
  property: string; // the picker's label ("" = none)
  categoryOverride: string;
  reimbursable: Reimbursable;
  recordedQuickbooks: boolean;
  recordedRentvine: boolean;
};

const cents = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export function SplitEditor({
  charge,
  initialLines,
  isSplit,
  resolveProperty,
  propertyOptions,
  categoryOptions,
  onClose,
  onSaved,
  onUnsplit,
}: {
  charge: { transactionId: string; amount: number; merchantName: string; postedDate: string | null };
  initialLines: EditorLine[];
  isSplit: boolean;
  resolveProperty: (label: string) => PropertyChoice | null;
  propertyOptions: string[]; // property / unit labels to pick from
  categoryOptions: string[]; // category suggestions (free text allowed)
  onClose: () => void;
  onSaved: (lines: StoredSplitLine[]) => void;
  onUnsplit: (header: Partial<SplitLine>) => void;
}) {
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = Math.round(charge.amount * 100);
  const amounts = lines.map((l) => cents(l.amount));
  const allValid = amounts.every((c) => Number.isFinite(c) && c !== 0);
  const sum = amounts.reduce((s, c) => s + (Number.isFinite(c) ? c : 0), 0);
  const left = total - sum;
  const canSave = !busy && lines.length >= 2 && allValid && left === 0;

  const set = (i: number, patch: Partial<EditorLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setError("");
    const body: SplitLine[] = [];
    for (const [i, l] of lines.entries()) {
      let propertyId: string | null = null;
      let unitId: string | null = null;
      if (l.property.trim()) {
        const choice = resolveProperty(l.property.trim());
        if (!choice) {
          setError(`Line ${i + 1}: “${l.property.trim()}” isn't one of your properties — pick one from the list.`);
          return;
        }
        propertyId = choice.propertyId;
        unitId = choice.unitId;
      }
      body.push({
        amount: cents(l.amount) / 100,
        propertyId,
        unitId,
        categoryOverride: l.categoryOverride.trim(),
        reimbursable: l.reimbursable,
        recordedQuickbooks: l.recordedQuickbooks,
        recordedRentvine: l.recordedRentvine,
      });
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/plaid/transactions/${encodeURIComponent(charge.transactionId)}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Could not save the split.");
      onSaved(d.lines as StoredSplitLine[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the split.");
    } finally {
      setBusy(false);
    }
  }

  async function unsplit() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/plaid/transactions/${encodeURIComponent(charge.transactionId)}/splits`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Could not unsplit.");
      onUnsplit(d.header ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unsplit.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-slate-300 px-1.5 py-1 text-xs outline-none focus:border-brand-500";
  const btn = "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Modal
      title={`Split ${formatCurrencyCents(charge.amount)} · ${charge.merchantName}`}
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        <>
          {isSplit && (
            <button
              type="button"
              disabled={busy}
              onClick={unsplit}
              className={`${btn} mr-auto border-slate-300 bg-white text-slate-600 hover:text-red-600`}
            >
              Unsplit
            </button>
          )}
          <button type="button" onClick={onClose} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}
          >
            Save split
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        {charge.postedDate ?? ""} · Each line gets its own property, category and reimbursable. Tick QuickBooks /
        Rentvine per line in the table.
      </p>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[5.5rem_1fr_1fr_6rem_auto] items-center gap-1.5">
            <input
              aria-label={`split-amount-${i + 1}`}
              inputMode="decimal"
              value={l.amount}
              placeholder="0.00"
              onChange={(e) => set(i, { amount: e.target.value })}
              className={`${input} text-right tabular-nums`}
            />
            <Combobox
              ariaLabel={`split-property-${i + 1}`}
              value={l.property}
              options={propertyOptions}
              strict
              placeholder="Property…"
              onChange={(v) => set(i, { property: v })}
              className={`${input} w-full`}
            />
            <Combobox
              ariaLabel={`split-category-${i + 1}`}
              value={l.categoryOverride}
              options={categoryOptions}
              placeholder="Category…"
              onChange={(v) => set(i, { categoryOverride: v })}
              className={`${input} w-full`}
            />
            <select
              aria-label={`split-reimbursable-${i + 1}`}
              value={l.reimbursable ?? ""}
              onChange={(e) => set(i, { reimbursable: e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : null })}
              className={input}
            >
              <option value="">Reimb?</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <button
              type="button"
              aria-label={`split-remove-${i + 1}`}
              disabled={lines.length <= 2}
              onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
              className="px-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
              title="Remove line"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { amount: left > 0 ? (left / 100).toFixed(2) : "", property: "", categoryOverride: "", reimbursable: null, recordedQuickbooks: false, recordedRentvine: false },
            ])
          }
          className="font-medium text-brand-600 hover:underline"
        >
          + Add line
        </button>
        <span className={left === 0 ? "text-emerald-700" : "font-medium text-amber-700"}>
          {left === 0
            ? "Lines add up ✓"
            : left > 0
              ? `${formatCurrencyCents(left / 100)} left to assign`
              : `${formatCurrencyCents(-left / 100)} over`}
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Modal>
  );
}
