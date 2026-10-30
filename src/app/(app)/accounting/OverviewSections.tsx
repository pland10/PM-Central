import { formatCurrency } from "@/lib/format";
import type { CashOnHandResult, ReimbursablesResult, MoneyOutResult } from "@/lib/accounting";

// The Accounting → Overview sections (cash on hand + reimbursables), rendered
// from already-fetched Rentvine results so they can be tested without the API.

export function CashOnHand({ cash }: { cash: CashOnHandResult }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cash on hand</h2>
      {!cash.ok ? (
        <ErrorBox>Couldn&apos;t load bank balances from Rentvine: {cash.error}</ErrorBox>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cash.accounts.map((a) => (
            <Tile key={a.id} label={a.name} value={formatCurrency(a.balance)} tone="slate" />
          ))}
          <Tile label="Total cash" value={formatCurrency(cash.total)} tone="emerald" hint="All accounts" />
        </div>
      )}
    </section>
  );
}

export function Reimbursables({ reimb }: { reimb: ReimbursablesResult }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reimbursables</h2>
      {!reimb.ok ? (
        <ErrorBox>Couldn&apos;t load reimbursables from Rentvine: {reimb.error}</ErrorBox>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile
              label="Outstanding"
              value={formatCurrency(reimb.outstanding)}
              tone={reimb.outstanding > 0 ? "amber" : "slate"}
              hint="Charged − reimbursed"
            />
            <Tile label="Total charged" value={formatCurrency(reimb.totalCharges)} tone="slate" />
            <Tile label="Total reimbursed" value={formatCurrency(reimb.totalPayments)} tone="slate" />
          </div>

          <div className="mt-4">
            {reimb.rows.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                No reimbursable activity on record.
              </p>
            ) : (
              // On phones, Charged/Reimbursed fold into one Amount column; the
              // box still scrolls sideways rather than clipping if it's too wide.
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium sm:hidden">Amount</th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Charged</th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Reimbursed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reimb.rows.map((r, i) => (
                      <tr key={i} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.date}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {r.description || "—"}
                          {r.reference && <span className="ml-1 text-xs text-slate-400">({r.reference})</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums sm:hidden">
                          {r.charges ? <div className="text-slate-700">{formatCurrency(r.charges)}</div> : null}
                          {r.payments ? (
                            <div className="text-emerald-700">+{formatCurrency(r.payments)}</div>
                          ) : null}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700 sm:table-cell">
                          {r.charges ? formatCurrency(r.charges) : ""}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700 sm:table-cell">
                          {r.payments ? formatCurrency(r.payments) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// Rentvine Transactions = money out: payments written from the bank accounts
// over the last 90 days, each with its payee (owner draw, vendor bill, …).
export function MoneyOut({ data }: { data: MoneyOutResult }) {
  if (!data.ok) {
    return <ErrorBox>Couldn&apos;t load payments from Rentvine: {data.error}</ErrorBox>;
  }
  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-ink">
          {data.count} payment{data.count === 1 ? "" : "s"}
        </span>
        <span className="text-slate-500">
          Total out <span className="font-semibold tabular-nums text-slate-800">{formatCurrency(data.total)}</span>
        </span>
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No payments in the last 90 days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Payee</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Check #</th>
                <th className="px-3 py-2 font-medium">Memo</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {r.payee || "—"}
                    {r.payeeType && <span className="ml-1 text-xs text-slate-400">({r.payeeType})</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.method || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.checkNumber || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.memo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatCurrency(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Posted dates come back ISO (YYYY-MM-DD); parse the parts locally so the day
// doesn't shift by timezone.
function fmtDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TONES: Record<string, string> = {
  emerald: "text-emerald-700",
  red: "text-red-700",
  amber: "text-amber-700",
  slate: "text-slate-800",
};

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONES | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${TONES[tone] || TONES.slate}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </p>
  );
}
