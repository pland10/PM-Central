"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrencyCents } from "@/lib/format";
import { applyRecord, monthLabel, round2, type DrawRecord, type DrawRow } from "@/lib/owner-draws";

// Accounting → Owner Draws table (replaces the monthly Owner Draws sheet).
// Balance / Reserve / Unpaid bills come from Rentvine and can be edited for the
// month (the Rentvine figure stays visible, with a reset). Due to owner is
// worked out. The coordinator ticks Paid; only the approver ticks Approve.
// Approving freezes the figures; changing a number afterwards takes the
// approval back. A paid row is locked.

type Field = "balance" | "reserve" | "unpaid";
const FIELD_LABEL: Record<Field, string> = { balance: "Balance", reserve: "Reserve", unpaid: "Unpaid bills" };
type Filter = "all" | "waiting" | "approved" | "paid" | "negative";

const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseAmount = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? round2(n) : NaN;
};
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "";

export function OwnerDraws({
  month,
  months,
  isCurrent,
  initialRows,
  canApprove,
  rentvineAccount,
}: {
  month: string;
  months: string[];
  isCurrent: boolean;
  initialRows: DrawRow[];
  canApprove: boolean;
  rentvineAccount: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function save(row: DrawRow, body: Record<string, unknown>): Promise<boolean> {
    setError("");
    setBusy((b) => ({ ...b, [row.portfolioId]: true }));
    try {
      const res = await fetch("/api/accounting/owner-draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, portfolioId: row.portfolioId, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { record?: DrawRecord; error?: string };
      if (!res.ok || !data.record) {
        setError(`${row.name}: ${data.error || "Couldn't save."}`);
        return false;
      }
      const wasFrozen = row.frozen;
      const next = applyRecord(row, data.record);
      setRows((rs) => rs.map((r) => (r.portfolioId === row.portfolioId ? next : r)));
      // Back to live numbers after being frozen: reload to get today's Rentvine figures.
      if (wasFrozen && !next.frozen && isCurrent) router.refresh();
      return true;
    } catch {
      setError(`${row.name}: couldn't save — check your connection.`);
      return false;
    } finally {
      setBusy((b) => ({ ...b, [row.portfolioId]: false }));
    }
  }

  async function setNumber(row: DrawRow, field: Field, raw: string) {
    const value = parseAmount(raw);
    if (Number.isNaN(value)) {
      setError(`${row.name}: "${raw}" isn't an amount.`);
      return;
    }
    const current = row.figures.edited[field] ? row.figures[field] : null;
    const target = value === row.rentvine[field] && !row.figures.edited[field] ? null : value;
    if (target === current || (target === null && !row.figures.edited[field])) return;
    if (row.approvedAt && !window.confirm("Changing a number takes back the approval. Continue?")) return;
    await save(row, { action: "set", field, value: target });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.owners.join(" ")}`.toLowerCase().includes(q)) return false;
      if (filter === "waiting") return !r.approvedAt && !r.paidAt;
      if (filter === "approved") return !!r.approvedAt && !r.paidAt;
      if (filter === "paid") return !!r.paidAt;
      if (filter === "negative") return r.figures.due < 0;
      return true;
    });
  }, [rows, query, filter]);

  const totalDue = round2(rows.reduce((s, r) => s + Math.max(0, r.figures.due), 0));
  const approved = rows.filter((r) => r.approvedAt).length;
  const paid = rows.filter((r) => r.paidAt).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            Month
            <select
              aria-label="Month"
              value={month}
              onChange={(e) => router.push(`/accounting/owner-draws?month=${e.target.value}`)}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search owners…"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select
            aria-label="Show"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All owners</option>
            <option value="waiting">Waiting for approval</option>
            <option value="approved">Approved, not paid</option>
            <option value="paid">Paid</option>
            <option value="negative">Due is negative</option>
          </select>
        </div>
        <div className="flex gap-4 text-sm text-slate-600">
          <span>
            Due to owners: <strong data-testid="total-due" className="text-ink">{formatCurrencyCents(totalDue)}</strong>
          </span>
          <span>
            Approved {approved}/{rows.length}
          </span>
          <span>
            Paid {paid}/{rows.length}
          </span>
        </div>
      </div>

      {!isCurrent && (
        <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {monthLabel(month)} — showing what was saved that month. Live Rentvine numbers are only on the current month.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Reserve</th>
              <th className="px-3 py-2 text-right">Unpaid bills</th>
              <th className="px-3 py-2 text-right">Due to owner</th>
              <th className="px-3 py-2 text-center">Approved</th>
              <th className="px-3 py-2 text-center">Paid</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const locked = !!r.paidAt || busy[r.portfolioId];
              return (
                <Fragment key={r.portfolioId}>
                  <tr aria-label={r.name} className={r.paidAt ? "bg-emerald-50/40" : r.approvedAt ? "bg-sky-50/40" : ""}>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={`https://${rentvineAccount}.rentvine.com/portfolios/${r.portfolioId}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${r.name} in Rentvine`}
                        className="font-medium text-ink hover:text-brand-600 hover:underline"
                      >
                        {r.name}
                      </a>
                      {r.owners.length > 0 && r.owners.join(" & ") !== r.name && (
                        <div className="text-xs text-slate-500">{r.owners.join(" & ")}</div>
                      )}
                      {r.hold && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          On hold in Rentvine
                        </span>
                      )}
                    </td>
                    {(["balance", "reserve", "unpaid"] as Field[]).map((f) => (
                      <td key={f} className="px-3 py-2 text-right align-top">
                        <AmountInput
                          label={`${FIELD_LABEL[f]} for ${r.name}`}
                          value={r.figures[f]}
                          edited={r.figures.edited[f]}
                          disabled={locked}
                          onCommit={(raw) => setNumber(r, f, raw)}
                        />
                        {r.figures.edited[f] && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            Rentvine: {formatCurrencyCents(r.rentvine[f])}{" "}
                            {!r.paidAt && (
                              <button
                                type="button"
                                aria-label={`Reset ${FIELD_LABEL[f].toLowerCase()} for ${r.name}`}
                                onClick={() => save(r, { action: "set", field: f, value: null })}
                                className="text-brand-600 hover:underline"
                              >
                                reset
                              </button>
                            )}
                          </div>
                        )}
                        {f === "reserve" && r.lastReserveLoweredBy > 0 && (
                          <div className="mt-0.5 text-xs text-amber-700">
                            Held {formatCurrencyCents(r.lastReserveLoweredBy)} less last month
                          </div>
                        )}
                        {f === "unpaid" && r.bills.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpen((o) => ({ ...o, [r.portfolioId]: !o[r.portfolioId] }))}
                            className="mt-0.5 block w-full text-right text-xs text-brand-600 hover:underline"
                          >
                            {r.bills.length} {r.bills.length === 1 ? "bill" : "bills"}
                          </button>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right align-top">
                      <span
                        data-testid={`due-${r.portfolioId}`}
                        className={`font-semibold tabular-nums ${r.figures.due < 0 ? "text-red-600" : "text-ink"}`}
                      >
                        {formatCurrencyCents(r.figures.due)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <input
                        type="checkbox"
                        aria-label={`Approve ${r.name}`}
                        checked={!!r.approvedAt}
                        disabled={!canApprove || busy[r.portfolioId] || (!isCurrent && !r.frozen)}
                        onChange={(e) =>
                          save(r, e.target.checked ? { action: "approve", expectDue: r.figures.due } : { action: "unapprove" })
                        }
                        className="h-4 w-4"
                      />
                      {r.approvedAt && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.approvedBy} · {shortDate(r.approvedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <input
                        type="checkbox"
                        aria-label={`Paid ${r.name}`}
                        checked={!!r.paidAt}
                        disabled={busy[r.portfolioId] || (!isCurrent && !r.frozen)}
                        onChange={(e) => save(r, { action: e.target.checked ? "paid" : "unpaid" })}
                        className="h-4 w-4"
                      />
                      {r.paidAt && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.paidBy} · {shortDate(r.paidAt)}
                        </div>
                      )}
                    </td>
                    <td className="min-w-[16rem] px-3 py-2 align-top">
                      <NoteInput label={`Note for ${r.name}`} value={r.note} onCommit={(v) => save(r, { action: "note", value: v })} />
                      {r.lastNote && <div className="mt-1 text-xs text-slate-500">Last month: {r.lastNote}</div>}
                    </td>
                  </tr>
                  {open[r.portfolioId] && (
                    <tr className="bg-slate-50">
                      <td />
                      <td colSpan={7} className="px-3 py-2">
                        <ul className="space-y-0.5 text-xs text-slate-600">
                          {r.bills.map((b, i) => (
                            <li key={`${b.billId}-${i}`} className="flex w-80 max-w-full justify-between gap-4">
                              <span>{b.description}</span>
                              <span className="tabular-nums">{formatCurrencyCents(b.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  {rows.length ? "No owners match." : "Nothing saved for this month."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AmountInput({
  label,
  value,
  edited,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  edited: boolean;
  disabled: boolean;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? fmt2(value)}
      disabled={disabled}
      onFocus={() => setDraft(fmt2(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const raw = draft ?? "";
        setDraft(null);
        if (raw !== fmt2(value)) onCommit(raw);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(fmt2(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-28 rounded border px-2 py-1 text-right tabular-nums disabled:bg-transparent disabled:text-slate-700 ${
        edited ? "border-amber-400 bg-amber-50" : "border-slate-200"
      }`}
    />
  );
}

function NoteInput({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      aria-label={label}
      rows={1}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = (draft ?? value).trim();
        setDraft(null);
        if (v !== value.trim()) onCommit(v);
      }}
      placeholder="Notes…"
      className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-sm"
    />
  );
}
