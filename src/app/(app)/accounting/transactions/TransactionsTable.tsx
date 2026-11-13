"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type Facet } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { formatCurrencyCents } from "@/lib/format";
import type { TxnRow } from "@/lib/plaid-db";
import type { PropertyChoice } from "@/lib/property-options";
import { rentvinePropertyId } from "@/lib/rentvine-ids";
import { classifyBilling, type BillingStatus } from "@/lib/rv-bill-match";
import { summarizeTransactions, type AnnotationPatch, type Reimbursable } from "@/lib/transactions-view";
import type { NoteSummary } from "@/lib/work-order-notes-db";
import { NotesCell } from "../../work-orders/NotesCell";
import { NotesPanel } from "@/components/NotesPanel";
import { expandSplitRows, parseRowId, rowIdOf } from "@/lib/transaction-splits";
import { SplitEditor, type EditorLine } from "./SplitEditor";

// The Transactions tab table: a summary bar, then every card/bank transaction
// in a sortable/filterable DataTable with the hand-entered columns editable
// inline (reimbursable?, your own category, recorded in QuickBooks / Rentvine).
// Each edit is saved on its own via PATCH /api/plaid/transactions/:id. Notes
// are a thread per charge (like work orders), with "Add note & email" —
// /api/accounting/transaction-notes.
// (Plaid's own category column was dropped as unhelpful; the `category` field is
// still synced and kept in the DB for possible later use.)

// Archive eligibility (mirrors the API guard): a row can be filed away once it's
// in QuickBooks AND either also in Rentvine or marked not reimbursable — the
// not-reimbursable items are the ones that never go to Rentvine. (Pending /
// already-archived are handled separately by each caller.)
const archivable = (r: TxnRow) => r.recordedQuickbooks && (r.recordedRentvine || r.reimbursable === "no");

// Not reimbursable = nothing to bill, so no status (and out of the filter).
const billingOf = (r: TxnRow): BillingStatus | null =>
  r.reimbursable === "no"
    ? null
    : classifyBilling({ amount: r.amount, propertyId: r.propertyId, candidates: r.rvCandidates });
const BILLED_RANK = { not_found: 0, possible: 1, billed: 2, none: 3 } as const;
const BILLED_TEXT = { not_found: "Not billed", possible: "Possible match", billed: "Billed", none: "" } as const;
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function BilledCell({
  id,
  status,
  billUrl,
  labelFor,
  notReimbursable = false,
}: {
  id: string;
  status: BillingStatus | null;
  notReimbursable?: boolean;
  billUrl: string;
  labelFor: (rvPropertyId: string) => string;
}) {
  const where = (props: string[]) => props.map(labelFor).join(", ");
  return (
    <div aria-label={`rv-billed-${id}`} className="text-xs">
      {notReimbursable ? (
        <span className="text-slate-400" title="Not reimbursable — no bill needed">
          —
        </span>
      ) : !status ? (
        <span className="text-slate-400">—</span>
      ) : status.status === "billed" ? (
        <a
          href={`${billUrl}${status.match.billId}`}
          target="_blank"
          rel="noreferrer"
          title={`${status.match.payee} · ${status.match.description}`}
          className="font-medium text-emerald-700 hover:underline"
        >
          ✓ Billed {shortDate(status.match.date)}
        </a>
      ) : status.status === "not_found" ? (
        <span className="font-medium text-red-600">✗ Not billed</span>
      ) : (
        <details>
          <summary className="cursor-pointer font-medium text-amber-700">
            ? Possible ({status.candidates.length})
          </summary>
          <ul className="mt-1 space-y-0.5 whitespace-normal text-slate-600">
            {status.candidates.map((c) => (
              <li key={`${c.kind}-${c.billId}-${c.properties.join(".")}`}>
                <a href={`${billUrl}${c.billId}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  {where(c.properties)}
                </a>{" "}
                · {shortDate(c.date)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Stable default (a fresh {} each render would look like new server data).
const NO_NOTES: Record<string, NoteSummary> = {};

export function TransactionsTable({
  initialRows,
  accounts,
  capped = false,
  hiddenCount = 0,
  canManageFilters = false,
  categories: initialCategories = [],
  properties = [],
  rentvineBillUrl = "https://pmilighthouse.rentvine.com/accounting/payables/bills/",
  noteSummaries = NO_NOTES,
}: {
  initialRows: TxnRow[];
  accounts: string[];
  capped?: boolean;
  hiddenCount?: number; // left out by Admin → Transaction filters
  canManageFilters?: boolean; // admins get a link to the filters page
  categories?: string[]; // the shared category list (suggestions while typing)
  properties?: PropertyChoice[]; // existing properties (and units of multi-unit ones) to link to
  rentvineBillUrl?: string; // bill id is appended, e.g. https://<sub>.rentvine.com/accounting/payables/bills/
  noteSummaries?: Record<string, NoteSummary>; // notes thread per transaction: count + latest
}) {
  const [rows, setRows] = useState<TxnRow[]>(initialRows);
  // Notes thread summaries, kept in step with the panel (and fresh server data).
  const [notes, setNotes] = useState<Record<string, NoteSummary>>(noteSummaries);
  const [lastNotes, setLastNotes] = useState(noteSummaries);
  if (noteSummaries !== lastNotes) {
    setLastNotes(noteSummaries);
    setNotes(noteSummaries);
  }
  const [notesFor, setNotesFor] = useState<TxnRow | null>(null);
  // The charge whose split editor is open (any of its rows).
  const [splitFor, setSplitFor] = useState<TxnRow | null>(null);
  // When the server sends a fresh list (router.refresh() after an import or a
  // newly connected account), show it — otherwise new rows only appear after
  // a full page reload. Saved edits are already in the fresh list.
  const [lastInitial, setLastInitial] = useState(initialRows);
  if (initialRows !== lastInitial) {
    setLastInitial(initialRows);
    setRows(initialRows);
  }
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<string[]>(initialCategories);

  // Optimistically apply the edit, then persist. If the save fails, roll the
  // row back to what it was so the UI never diverges from the server.
  // `id` is the row id: the transaction id, or "<id>#<line>" for a split line
  // (which saves to that line only).
  const save = useCallback(async (id: string, patch: AnnotationPatch) => {
    let prevRow: TxnRow | undefined;
    setRows((prev) =>
      prev.map((r) => {
        if (rowIdOf(r) !== id) return r;
        prevRow = r;
        return { ...r, ...patch };
      })
    );
    const { transactionId: txn, lineId } = parseRowId(id);
    const url =
      lineId !== null
        ? `/api/plaid/transactions/${encodeURIComponent(txn)}/splits/${lineId}`
        : `/api/plaid/transactions/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "");
      // The server may save a category under the list's spelling ("pay roll"
      // → "Payroll"); show what was actually saved and add it to the list.
      const saved = data?.patch?.categoryOverride;
      if (typeof saved === "string") {
        setRows((prev) => prev.map((r) => (rowIdOf(r) === id ? { ...r, categoryOverride: saved } : r)));
        if (saved) setCategories((prev) => (prev.includes(saved) ? prev : [...prev, saved].sort((a, b) => a.localeCompare(b))));
      }
      setError("");
    } catch (e) {
      if (prevRow) setRows((prev) => prev.map((r) => (rowIdOf(r) === id ? prevRow! : r)));
      const reason = e instanceof Error && e.message ? `${e.message} ` : "";
      setError(`${reason}A change couldn't be saved — reverted it.`);
    }
  }, []);

  // Archive / unarchive one row (a row recorded in both QuickBooks and Rentvine
  // can be filed away; unarchiving undoes a mistake). Optimistic like `save`.
  const archive = useCallback(async (id: string, archived: boolean) => {
    // A split charge archives as a whole: every line row goes together.
    setRows((prev) => prev.map((r) => (r.transactionId === id ? { ...r, archived } : r)));
    try {
      const res = await fetch(`/api/plaid/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "");
      setError("");
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.transactionId === id ? { ...r, archived: !archived } : r)));
      const reason = e instanceof Error && e.message ? `${e.message} ` : "";
      setError(`${reason}Couldn't ${archived ? "archive" : "unarchive"} — reverted it.`);
    }
  }, []);

  // Rows that can be filed away: in QuickBooks and either also in Rentvine or
  // marked not reimbursable (the items that never go to Rentvine), posted, not
  // already archived. Powers the "Archive all recorded" button.
  // A split charge is archivable once EVERY line is (mirrors the API).
  const chargeArchivable = useMemo(() => {
    const ok = new Map<string, boolean>();
    for (const r of rows) ok.set(r.transactionId, (ok.get(r.transactionId) ?? true) && archivable(r));
    return ok;
  }, [rows]);
  const canArchive = useCallback((r: TxnRow) => chargeArchivable.get(r.transactionId) ?? false, [chargeArchivable]);
  const eligibleToArchive = useMemo(
    () => rows.filter((r) => canArchive(r) && !r.pending && !r.archived),
    [rows, canArchive]
  );

  // Archive every eligible row at once — confirmed in a modal (with a
  // breakdown, totals and a short preview), or after "Review first", which
  // narrows the table to exactly that batch. The server sweeps the whole table
  // (so it also catches rows beyond the loaded cap) and returns the ids it
  // archived, which powers Undo for ~10 seconds afterwards.
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(t);
  }, [undo]);

  const archiveAllRecorded = useCallback(async () => {
    const eligible = rows.filter((r) => canArchive(r) && !r.pending && !r.archived);
    setConfirmArchive(false);
    if (eligible.length === 0) return;
    const ids = new Set(eligible.map((r) => r.transactionId));
    const before = new Map(eligible.map((r) => [rowIdOf(r), r]));
    setRows((prev) => prev.map((r) => (ids.has(r.transactionId) ? { ...r, archived: true } : r)));
    try {
      const res = await fetch("/api/plaid/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveAllRecorded: true }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      const done: string[] = Array.isArray(data?.ids) ? data.ids : [...ids];
      setError("");
      setReviewing(false);
      setUndo({ ids: done, count: typeof data?.archived === "number" ? data.archived : done.length });
    } catch {
      setRows((prev) => prev.map((r) => before.get(rowIdOf(r)) ?? r));
      setError("Couldn't archive all recorded — reverted it. Please try again.");
    }
  }, [rows, canArchive]);

  const undoArchive = useCallback(async () => {
    if (!undo) return;
    const ids = new Set(undo.ids);
    setUndo(null);
    setRows((prev) => prev.map((r) => (ids.has(r.transactionId) ? { ...r, archived: false } : r)));
    try {
      const res = await fetch("/api/plaid/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unarchiveIds: [...ids] }),
      });
      if (!res.ok) throw new Error();
      setError("");
    } catch {
      setRows((prev) => prev.map((r) => (ids.has(r.transactionId) ? { ...r, archived: true } : r)));
      setError("Couldn't undo the archive. Use the Archived filter to unarchive rows one by one.");
    }
  }, [undo]);

  // Multi-select for bulk "reimbursable" edits. `shown` tracks the rows the
  // DataTable is currently displaying (after search/filters) for "select all".
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<TxnRow[]>(initialRows);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  // Optimistic like `save`, but for every selected row in one request.
  async function bulkSetReimbursable(value: Reimbursable) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const before = new Map(rows.filter((r) => selected.has(rowIdOf(r))).map((r) => [rowIdOf(r), r]));
    setRows((prev) => prev.map((r) => (selected.has(rowIdOf(r)) ? { ...r, reimbursable: value } : r)));
    try {
      const res = await fetch("/api/plaid/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reimbursable: value }),
      });
      if (!res.ok) throw new Error();
      setError("");
      stopSelecting();
    } catch {
      setRows((prev) => prev.map((r) => before.get(rowIdOf(r)) ?? r));
      setError("The bulk change couldn't be saved — reverted it. Please try again.");
    }
  }

  // An edited pending charge that vanished with no posted replacement isn't a
  // real transaction any more: it lives only in the Needs review box.
  const tableRows = useMemo(() => rows.filter((r) => r.reviewReason !== "pending_dropped"), [rows]);
  const reviewRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => r.reviewReason && !seen.has(r.transactionId) && seen.add(r.transactionId));
  }, [rows]);

  // The split editor's starting lines: the charge's current lines, or (first
  // split) the whole amount on line 1 with the charge's own fields + an empty line 2.
  function editorLinesFor(r: TxnRow): EditorLine[] {
    const toEditor = (x: TxnRow): EditorLine => ({
      amount: x.amount.toFixed(2),
      property: propertyLabel(x),
      categoryOverride: x.categoryOverride,
      reimbursable: x.reimbursable,
      recordedQuickbooks: x.recordedQuickbooks,
      recordedRentvine: x.recordedRentvine,
    });
    if (r.split) return rows.filter((x) => x.transactionId === r.transactionId).map(toEditor);
    return [
      toEditor(r),
      { amount: "", property: "", categoryOverride: "", reimbursable: null, recordedQuickbooks: false, recordedRentvine: false },
    ];
  }

  // Swap a charge's row(s) for new ones, in place. `make` gets the charge's
  // header row (its own fields, the full amount, no split info).
  function replaceCharge(transactionId: string, make: (header: TxnRow) => TxnRow[]) {
    setRows((prev) => {
      const at = prev.findIndex((r) => r.transactionId === transactionId);
      if (at < 0) return prev;
      const first = prev[at];
      const header: TxnRow = { ...first, amount: first.split?.total ?? first.amount, rowId: undefined, split: undefined };
      const rest = prev.filter((r) => r.transactionId !== transactionId);
      return [...rest.slice(0, at), ...make(header), ...rest.slice(at)];
    });
  }

  // Needs review actions (POST /api/plaid/transactions/:id/review).
  async function review(id: string, body: { action: "move" | "dismiss" | "ok"; targetId?: string }) {
    setError("");
    try {
      const res = await fetch(`/api/plaid/transactions/${encodeURIComponent(id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("That review action couldn't be saved. Please try again.");
      return;
    }
    if (body.action !== "ok") {
      setNotes((prev) => {
        const { [id]: moved, ...rest } = prev;
        if (body.action !== "move" || !moved || !body.targetId) return rest;
        const into = rest[body.targetId];
        const merged =
          into && into.latestAt > moved.latestAt
            ? { ...into, count: into.count + moved.count }
            : { ...moved, count: moved.count + (into?.count ?? 0) };
        return { ...rest, [body.targetId]: merged };
      });
    }
    setRows((prev) => {
      if (body.action === "ok") return prev.map((r) => (r.transactionId === id ? { ...r, reviewReason: null, reviewDetail: "" } : r));
      const src = prev.find((r) => r.transactionId === id);
      const rest = prev.filter((r) => r.transactionId !== id);
      if (body.action !== "move" || !src) return rest;
      // Mirror the server: fill only what's still empty on the target.
      return rest.map((r) =>
        r.transactionId !== body.targetId
          ? r
          : {
              ...r,
              reimbursable: r.reimbursable ?? src.reimbursable,
              categoryOverride: r.categoryOverride || src.categoryOverride,
              recordedQuickbooks: r.recordedQuickbooks || src.recordedQuickbooks,
              recordedRentvine: r.recordedRentvine || src.recordedRentvine,
              notes: r.notes || src.notes,
              propertyId: r.propertyId ?? src.propertyId,
              unitId: r.propertyId ? r.unitId : src.unitId,
            }
      );
    });
  }

  const summary = useMemo(
    () =>
      summarizeTransactions(
        tableRows
          .filter((r) => !r.archived) // the tiles describe the active working set
          .map((r) => ({
            amount: r.amount,
            reimbursable: r.reimbursable,
            recordedQuickbooks: r.recordedQuickbooks,
            recordedRentvine: r.recordedRentvine,
          }))
      ),
    [tableRows]
  );

  // Property typeahead: the choices (property, or property + unit) come in
  // with unique labels; look them up both ways. Only these can be saved.
  const propertyLookup = useMemo(() => {
    const byKey = new Map<string, PropertyChoice>();
    const byLabel = new Map<string, PropertyChoice>();
    const byRvId = new Map<string, string>(); // bare Rentvine property id -> label
    for (const c of properties) {
      byKey.set(`${c.propertyId}|${c.unitId ?? ""}`, c);
      byLabel.set(c.label.toLowerCase(), c);
      if (!c.unitId) byRvId.set(rentvinePropertyId(c.propertyId), c.label);
    }
    return { byKey, byLabel, byRvId };
  }, [properties]);
  const propertyLabel = useCallback(
    (r: Pick<TxnRow, "propertyId" | "unitId">) => {
      if (!r.propertyId) return "";
      const exact = propertyLookup.byKey.get(`${r.propertyId}|${r.unitId ?? ""}`);
      if (exact) return exact.label;
      const prop = propertyLookup.byKey.get(`${r.propertyId}|`)?.label ?? `Property #${r.propertyId}`;
      return r.unitId ? `${prop} — Unit #${r.unitId}` : prop;
    },
    [propertyLookup]
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
        exportValue: (r) => r.merchantName,
        // Matches the merchant or the raw bank description.
        filter: { type: "text", value: (r) => `${r.merchantName} ${r.name}` },
        render: (r) => (
          // Raw bank descriptions can be very long; wrap them in a narrow
          // column instead of pushing the editable columns off screen.
          <span className="block max-w-[14rem] break-words text-slate-800">
            {r.merchantName || "—"}
            {r.pending && <span className="ml-1 text-xs text-amber-600">(pending)</span>}
          </span>
        ),
      },
      {
        key: "property",
        header: "Property",
        sortable: true,
        sortValue: (r) => propertyLabel(r).toLowerCase(),
        exportValue: (r) => propertyLabel(r),
        filter: { type: "select", value: (r) => propertyLabel(r) || "(none)" },
        render: (r) => {
          const current = propertyLabel(r);
          return (
            <input
              key={`prop-${rowIdOf(r)}-${r.propertyId ?? ""}-${r.unitId ?? ""}`}
              aria-label={`property-${rowIdOf(r)}`}
              onKeyDown={blurOnEnter}
              defaultValue={current}
              list={PROPERTY_LIST_ID}
              placeholder="Search…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === current) return;
                if (!v) {
                  if (r.propertyId) save(rowIdOf(r), { propertyId: null, unitId: null });
                  return;
                }
                const choice = propertyLookup.byLabel.get(v.toLowerCase());
                if (!choice) {
                  e.target.value = current;
                  setError(`“${v}” isn't one of your properties — pick a property from the list.`);
                  return;
                }
                if (choice.propertyId !== r.propertyId || choice.unitId !== r.unitId) {
                  save(rowIdOf(r), { propertyId: choice.propertyId, unitId: choice.unitId });
                }
              }}
              className="w-48 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
          );
        },
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
          <div className="flex flex-col items-end">
            <span className={`tabular-nums ${r.amount < 0 ? "text-emerald-700" : "text-slate-800"}`}>
              {formatCurrencyCents(r.amount)}
            </span>
            {r.split ? (
              <>
                <span className="whitespace-nowrap text-[11px] text-slate-500">
                  Split {r.split.lineNo} of {r.split.count} · {formatCurrencyCents(r.split.total)}
                </span>
                <button
                  type="button"
                  onClick={() => setSplitFor(r)}
                  className="text-[11px] font-medium text-brand-600 hover:underline"
                >
                  Edit split
                </button>
                {!r.split.balanced && (
                  <span className="whitespace-nowrap text-[11px] font-medium text-amber-700" title="The charge's amount changed after it was split">
                    Lines don&apos;t add up
                  </span>
                )}
              </>
            ) : (
              !r.archived && (
                <button
                  type="button"
                  aria-label={`split-${r.transactionId}`}
                  onClick={() => setSplitFor(r)}
                  className="text-[11px] font-medium text-slate-400 hover:text-brand-600"
                >
                  Split
                </button>
              )
            )}
          </div>
        ),
      },
      {
        key: "categoryOverride",
        header: "Category (yours)",
        sortable: true,
        sortValue: (r) => r.categoryOverride.toLowerCase(),
        exportValue: (r) => r.categoryOverride,
        filter: { type: "select", value: (r) => r.categoryOverride || "(none)" },
        render: (r) => (
          <input
            key={`cat-${rowIdOf(r)}-${r.categoryOverride}`}
            aria-label={`category-${rowIdOf(r)}`}
            onKeyDown={blurOnEnter}
            defaultValue={r.categoryOverride}
            list={CATEGORY_LIST_ID}
            placeholder="Search…"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== r.categoryOverride) save(rowIdOf(r), { categoryOverride: v });
            }}
            className="w-32 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        ),
      },
      {
        key: "reimbursable",
        header: "Reimbursable?",
        nowrap: true,
        align: "center",
        sortable: true,
        sortValue: (r) => r.reimbursable ?? "",
        exportValue: (r) => (r.reimbursable === "yes" ? "Yes" : r.reimbursable === "no" ? "No" : ""),
        render: (r) => (
          <select
            aria-label={`reimbursable-${rowIdOf(r)}`}
            value={r.reimbursable ?? ""}
            onChange={(e) =>
              save(rowIdOf(r), {
                reimbursable: e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : null,
              })
            }
            className={`rounded border px-1.5 py-1 text-xs outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-40 ${
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
        nowrap: true,
        align: "center",
        sortable: true,
        sortValue: (r) => (r.recordedQuickbooks ? 1 : 0),
        exportValue: (r) => (r.recordedQuickbooks ? "Yes" : "No"),
        render: (r) => (
          <input
            type="checkbox"
            aria-label={`quickbooks-${rowIdOf(r)}`}
            checked={r.recordedQuickbooks}
            onChange={(e) => save(rowIdOf(r), { recordedQuickbooks: e.target.checked })}
            className="h-4 w-4 accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        ),
      },
      {
        key: "recordedRentvine",
        header: "In Rentvine",
        nowrap: true,
        align: "center",
        sortable: true,
        sortValue: (r) => (r.recordedRentvine ? 1 : 0),
        exportValue: (r) => (r.recordedRentvine ? "Yes" : "No"),
        render: (r) => (
          <input
            type="checkbox"
            aria-label={`rentvine-${rowIdOf(r)}`}
            checked={r.recordedRentvine}
            // Not reimbursable = nothing to charge the owner in Rentvine. A box
            // ticked before it was marked "no" stays clickable so it can be cleared.
            disabled={r.reimbursable === "no" && !r.recordedRentvine}
            title={r.reimbursable === "no" ? "Not reimbursable — nothing to charge in Rentvine" : undefined}
            onChange={(e) => save(rowIdOf(r), { recordedRentvine: e.target.checked })}
            className="h-4 w-4 accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        ),
      },
      {
        // Read-only lookup: was this amount billed to the owner in Rentvine,
        // on the tagged property? Re-evaluated from the row's current property.
        key: "rvBilled",
        header: "Billed in Rentvine",
        nowrap: true,
        sortable: true,
        sortValue: (r) => BILLED_RANK[billingOf(r)?.status ?? "none"],
        exportValue: (r) => BILLED_TEXT[billingOf(r)?.status ?? "none"],
        render: (r) => (
          <BilledCell
            id={rowIdOf(r)}
            status={billingOf(r)}
            notReimbursable={r.reimbursable === "no"}
            billUrl={rentvineBillUrl}
            labelFor={(rv) => propertyLookup.byRvId.get(rv) ?? `Property #${rv}`}
          />
        ),
      },
      {
        key: "notes",
        header: "Notes",
        filter: { type: "text", value: (r) => notes[r.transactionId]?.latest ?? "" },
        sortValue: (r) => notes[r.transactionId]?.latestAt ?? "",
        exportValue: (r) => notes[r.transactionId]?.latest ?? "",
        render: (r) => (
          <NotesCell
            summary={notes[r.transactionId]}
            onOpen={() => setNotesFor(r)}
            ariaLabel={`notes-${r.transactionId}`}
          />
        ),
      },
      {
        key: "archive",
        header: "",
        exportable: false,
        render: (r) =>
          r.archived ? (
            <button
              type="button"
              aria-label={`unarchive-${r.transactionId}`}
              onClick={() => archive(r.transactionId, false)}
              className="whitespace-nowrap text-xs font-medium text-slate-500 hover:text-brand-600"
            >
              Unarchive
            </button>
          ) : r.split && r.split.lineNo > 1 ? (
            <span className="text-slate-300" title="A split charge is archived as a whole — use line 1">
              ·
            </span>
          ) : !r.pending && canArchive(r) ? (
            <button
              type="button"
              aria-label={`archive-${r.transactionId}`}
              onClick={() => archive(r.transactionId, true)}
              className="whitespace-nowrap text-xs font-medium text-slate-500 hover:text-red-600"
            >
              Archive
            </button>
          ) : (
            <span
              className="text-slate-300"
              title={
                r.split
                  ? "To archive a split charge: record every line in QuickBooks and Rentvine (or QuickBooks + not reimbursable)"
                  : "To archive: record it in QuickBooks and Rentvine, or in QuickBooks and mark it not reimbursable"
              }
            >
              —
            </span>
          ),
      },
    ],
    [save, archive, canArchive, accounts, propertyLabel, propertyLookup, rentvineBillUrl, notes]
  );

  const shownColumns = useMemo<Column<TxnRow>[]>(
    () =>
      selecting
        ? [
            {
              key: "select",
              header: "",
              exportable: false,
              render: (r) => (
                <input
                  type="checkbox"
                  aria-label={`select-${rowIdOf(r)}`}
                  checked={selected.has(rowIdOf(r))}
                  onChange={() => toggleSelected(rowIdOf(r))}
                  className="h-4 w-4 accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                />
              ),
            },
            ...columns,
          ]
        : columns,
    [selecting, selected, toggleSelected, columns]
  );

  const facets = useMemo<Facet<TxnRow>[]>(
    () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ],
        match: (r, v) => (v === "archived" ? r.archived : !r.archived),
      },
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
      {
        key: "rvBilled",
        label: "Billed in Rentvine",
        options: [
          { value: "billed", label: "Billed" },
          { value: "possible", label: "Possible match" },
          { value: "not_found", label: "Not billed" },
        ],
        match: (r, v) => billingOf(r)?.status === v,
      },
    ],
    []
  );

  return (
    <div>
      {reviewRows.length > 0 && (
        <ReviewBox items={reviewRows} candidatesFrom={tableRows} onAction={review} notes={notes} />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Transactions" value={String(summary.count)} />
        <SummaryTile label="Total spend" value={formatCurrencyCents(summary.totalSpend)} />
        <SummaryTile
          label="Reimbursable"
          value={formatCurrencyCents(summary.reimbursableTotal)}
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

      {capped && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing the most recent {rows.length.toLocaleString()} transactions — the totals above
          cover only these rows, not the full history.
        </p>
      )}

      {hiddenCount > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          {hiddenCount.toLocaleString()} transaction{hiddenCount === 1 ? "" : "s"} hidden by filters
          {canManageFilters && (
            <>
              {" · "}
              <Link href="/admin/transaction-filters" className="font-medium text-brand-600 hover:underline">
                Manage filters
              </Link>
            </>
          )}
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {!selecting ? (
          <>
            <button type="button" onClick={() => setSelecting(true)} className={BTN}>
              Select
            </button>
            {eligibleToArchive.length > 0 && !reviewing && (
              <button type="button" onClick={() => setConfirmArchive(true)} className={BTN}>
                Archive all recorded ({eligibleToArchive.length.toLocaleString()})
              </button>
            )}
          </>
        ) : (
          <>
            {selected.size > 0 && <span className="font-medium text-slate-700">{selected.size} selected</span>}
            <button
              type="button"
              onClick={() => setSelected(new Set(shown.map((r) => rowIdOf(r))))}
              className={BTN}
            >
              Select all {shown.length.toLocaleString()} shown
            </button>
            {selected.size > 0 && (
              <>
                <span className="ml-2 text-xs text-slate-500">Set reimbursable:</span>
                <button type="button" aria-label="Set reimbursable: Yes" onClick={() => bulkSetReimbursable("yes")} className={BTN}>
                  Yes
                </button>
                <button type="button" aria-label="Set reimbursable: No" onClick={() => bulkSetReimbursable("no")} className={BTN}>
                  No
                </button>
                <button
                  type="button"
                  aria-label="Set reimbursable: Unreviewed"
                  onClick={() => bulkSetReimbursable(null)}
                  className={BTN}
                >
                  Unreviewed
                </button>
              </>
            )}
            <button type="button" onClick={stopSelecting} className="ml-auto text-xs text-slate-500 hover:text-slate-700">
              Done
            </button>
          </>
        )}
      </div>

      {/* Suggestions for every Property box: existing properties only. */}
      <datalist id={PROPERTY_LIST_ID}>
        {properties.map((c) => (
          <option key={c.label} value={c.label} />
        ))}
      </datalist>

      {/* Suggestions for every "Category (yours)" box, shared by all rows. */}
      <datalist id={CATEGORY_LIST_ID}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {reviewing && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Showing {eligibleToArchive.length.toLocaleString()} ready to archive. Uncheck QuickBooks on any that
            shouldn&apos;t go and it drops out.
          </span>
          <span className="ml-auto flex gap-2">
            {eligibleToArchive.length > 0 && (
              <button
                type="button"
                onClick={archiveAllRecorded}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
              >
                Archive these ({eligibleToArchive.length.toLocaleString()})
              </button>
            )}
            <button type="button" onClick={() => setReviewing(false)} className={BTN}>
              Back to all
            </button>
          </span>
        </div>
      )}

      {undo && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-800 px-3 py-2 text-sm text-white">
          <span>
            Archived {undo.count.toLocaleString()} transaction{undo.count === 1 ? "" : "s"}.
          </span>
          <button type="button" onClick={undoArchive} className="font-semibold text-amber-300 hover:underline">
            Undo
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setUndo(null)} className="ml-auto text-slate-300 hover:text-white">
            ×
          </button>
        </div>
      )}

      {confirmArchive && (
        <ArchiveConfirm
          eligible={eligibleToArchive}
          onCancel={() => setConfirmArchive(false)}
          onReview={() => {
            setConfirmArchive(false);
            setReviewing(true);
          }}
          onArchive={archiveAllRecorded}
        />
      )}

      <DataTable<TxnRow>
        rows={reviewing ? eligibleToArchive : tableRows}
        columns={shownColumns}
        onFilteredChange={setShown}
        wide
        dense
        rowKey={(r) => rowIdOf(r)}
        // Tint split lines and give them a brand accent stripe so the lines of
        // one charge read as a linked group.
        rowClassName={(r) => (r.split ? "bg-brand-50/60 shadow-[inset_3px_0_0_0_var(--brand-primary)]" : undefined)}
        search={(r) => `${r.merchantName} ${r.name} ${r.accountName} ${r.categoryOverride} ${notes[r.transactionId]?.latest ?? ""}`}
        searchPlaceholder="Search merchant, notes…"
        facets={facets}
        initialFacets={{ status: "active" }}
        initialSort={{ key: "postedDate", dir: "desc" }}
        exportName="Transactions"
      />

      {splitFor && (
        <SplitEditor
          charge={{
            transactionId: splitFor.transactionId,
            amount: splitFor.split?.total ?? splitFor.amount,
            merchantName: splitFor.merchantName,
            postedDate: splitFor.postedDate,
          }}
          isSplit={!!splitFor.split}
          initialLines={editorLinesFor(splitFor)}
          resolveProperty={(label) => propertyLookup.byLabel.get(label.toLowerCase()) ?? null}
          propertyListId={PROPERTY_LIST_ID}
          categoryListId={CATEGORY_LIST_ID}
          onClose={() => setSplitFor(null)}
          onSaved={(lines) => {
            replaceCharge(splitFor.transactionId, (header) => expandSplitRows([header], { [header.transactionId]: lines }));
            setSplitFor(null);
          }}
          onUnsplit={(fields) => {
            replaceCharge(splitFor.transactionId, (header) => [{ ...header, ...fields }]);
            setSplitFor(null);
          }}
        />
      )}

      {notesFor && (
        <NotesPanel
          api="/api/accounting/transaction-notes"
          listQuery={`txn=${encodeURIComponent(notesFor.transactionId)}`}
          postKey={{ transactionId: notesFor.transactionId }}
          heading={["Notes", notesFor.postedDate, notesFor.accountName].filter(Boolean).join(" · ")}
          title={`${formatCurrencyCents(notesFor.amount)} · ${notesFor.merchantName}`}
          placeholder="e.g. Owner approved — bill to 18-47 26th Rd"
          dialogLabel={`Notes for ${formatCurrencyCents(notesFor.amount)} · ${notesFor.merchantName}`}
          onClose={() => setNotesFor(null)}
          onAdded={(note, count) =>
            setNotes((prev) => ({
              ...prev,
              [notesFor.transactionId]: { count, latest: note.body, latestAt: note.createdAt, latestBy: note.authorName },
            }))
          }
          onChanged={(latest, count) =>
            setNotes((prev) => {
              const { [notesFor.transactionId]: _drop, ...rest } = prev;
              return latest
                ? { ...rest, [notesFor.transactionId]: { count, latest: latest.body, latestAt: latest.createdAt, latestBy: latest.authorName } }
                : rest;
            })
          }
        />
      )}
    </div>
  );
}

const CATEGORY_LIST_ID = "txn-category-options";
const PROPERTY_LIST_ID = "txn-property-options";

// Enter saves a text box: blurring it runs the same onBlur save as clicking away.
function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

const BTN =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600";

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

// The "Archive all recorded" confirmation: what's going (by group, with
// totals) and a short preview. Long lists are reviewed in the table itself via
// "Review first", not crammed into the modal.
const PREVIEW = 5;
function ArchiveConfirm({
  eligible,
  onCancel,
  onReview,
  onArchive,
}: {
  eligible: TxnRow[];
  onCancel: () => void;
  onReview: () => void;
  onArchive: () => void;
}) {
  const both = eligible.filter((r) => r.recordedRentvine);
  const qbOnly = eligible.filter((r) => !r.recordedRentvine);
  const total = (xs: TxnRow[]) => xs.reduce((s, r) => s + r.amount, 0);
  const n = eligible.length;
  const preview = [...eligible].sort((a, b) => (b.postedDate ?? "").localeCompare(a.postedDate ?? "")).slice(0, PREVIEW);
  return (
    <Modal
      title={`Archive ${n.toLocaleString()} transaction${n === 1 ? "" : "s"}?`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={onReview} className={BTN}>
            Review first
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onArchive}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Archive {n.toLocaleString()}
          </button>
        </>
      }
    >
      <p className="mb-3 text-slate-500">They&apos;ll be hidden from the working list. You can unarchive any of them later.</p>
      <ul className="mb-4 space-y-1">
        <li className="flex justify-between">
          <span>{both.length.toLocaleString()} in both QuickBooks and Rentvine</span>
          <span className="tabular-nums">{formatCurrencyCents(total(both))}</span>
        </li>
        <li className="flex justify-between">
          <span>{qbOnly.length.toLocaleString()} in QuickBooks only (not reimbursable)</span>
          <span className="tabular-nums">{formatCurrencyCents(total(qbOnly))}</span>
        </li>
      </ul>
      <div className="rounded-md border border-slate-200">
        {preview.map((r) => (
          <div key={r.transactionId} className="flex gap-3 border-b border-slate-100 px-3 py-1.5 text-xs last:border-b-0">
            <span className="w-20 shrink-0 text-slate-500">{r.postedDate}</span>
            <span className="min-w-0 flex-1 truncate">{r.merchantName || r.name}</span>
            <span className="tabular-nums">{formatCurrencyCents(r.amount)}</span>
          </div>
        ))}
        {n > PREVIEW && (
          <div className="px-3 py-1.5 text-xs text-slate-500">…and {(n - PREVIEW).toLocaleString()} more</div>
        )}
      </div>
    </Modal>
  );
}

// Posted charges an orphaned pending charge most likely became: same account,
// within ±10 days, closest amount first.
function moveTargets(src: TxnRow, from: TxnRow[]): TxnRow[] {
  const t = src.postedDate ? Date.parse(src.postedDate) : NaN;
  return from
    .filter(
      (r) =>
        !r.pending &&
        !r.archived &&
        r.accountName === src.accountName &&
        (Number.isNaN(t) || !r.postedDate || Math.abs(Date.parse(r.postedDate) - t) <= 10 * 86_400_000)
    )
    .sort((a, b) => Math.abs(a.amount - src.amount) - Math.abs(b.amount - src.amount))
    .slice(0, 25);
}

// "Needs review": edited pending charges that vanished with no posted
// replacement linked to them (move the edits to the right charge, or dismiss),
// and carried-over charges whose posted amount changed (confirm it).
function ReviewBox({
  items,
  candidatesFrom,
  onAction,
  notes,
}: {
  items: TxnRow[];
  candidatesFrom: TxnRow[];
  notes: Record<string, NoteSummary>;
  onAction: (id: string, body: { action: "move" | "dismiss" | "ok"; targetId?: string }) => void;
}) {
  const [target, setTarget] = useState<Record<string, string>>({});
  return (
    <section aria-label="Needs review" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h2 className="text-sm font-semibold text-amber-900">Needs review ({items.length})</h2>
      <p className="mb-2 text-xs text-amber-800">
        Edits made on a pending charge that couldn&apos;t be matched to its posted charge automatically, or that posted
        for a different amount.
      </p>
      <ul className="space-y-2">
        {items.map((r) => {
          const dropped = r.reviewReason === "pending_dropped";
          const options = dropped ? moveTargets(r, candidatesFrom) : [];
          return (
            <li key={r.transactionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-amber-200 bg-white px-3 py-2 text-xs">
              <span className="font-medium text-slate-800">
                {r.postedDate ?? "—"} · {r.merchantName} · {formatCurrencyCents(r.split?.total ?? r.amount)}
              </span>
              <span className="text-slate-500">{r.accountName}</span>
              {notes[r.transactionId] && <span className="text-slate-700">{notes[r.transactionId].latest}</span>}
              <span className="text-amber-800">{r.reviewDetail}</span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {dropped ? (
                  <>
                    <select
                      aria-label={`move-target-${r.transactionId}`}
                      value={target[r.transactionId] ?? ""}
                      onChange={(e) => setTarget((t) => ({ ...t, [r.transactionId]: e.target.value }))}
                      className="max-w-[18rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
                    >
                      <option value="">Move to…</option>
                      {options.map((o) => (
                        <option key={o.transactionId} value={o.transactionId}>
                          {o.postedDate} · {o.merchantName} · {formatCurrencyCents(o.amount)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!target[r.transactionId]}
                      onClick={() => onAction(r.transactionId, { action: "move", targetId: target[r.transactionId] })}
                      className={`${BTN} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      Move edits
                    </button>
                    <button type="button" onClick={() => onAction(r.transactionId, { action: "dismiss" })} className={BTN}>
                      Dismiss
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => onAction(r.transactionId, { action: "ok" })} className={BTN}>
                    Looks right
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
