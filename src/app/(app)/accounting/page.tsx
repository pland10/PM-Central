import { requireFeature } from "@/config/features";
import { formatCurrency } from "@/lib/format";
import {
  fetchCashOnHand,
  fetchReimbursables,
  isRentvineConfigured,
  type CashOnHandResult,
  type ReimbursablesResult,
} from "@/lib/accounting";

// Live accounting roll-up for PMI Lighthouse, read straight from Rentvine on
// each load (no sync — always current). v1: cash on hand across the bank
// accounts, and the reimbursables account's outstanding balance + activity.
export const dynamic = "force-dynamic";
// Live Rentvine report fetches — headroom for serverless (Vercel); no-op on Railway.
export const maxDuration = 60;

export default async function AccountingPage() {
  requireFeature("accounting");

  if (!isRentvineConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold text-ink">Accounting</h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rentvine isn&apos;t configured for this environment. Set <code>RENTVINE_API_KEY</code> and{" "}
          <code>RENTVINE_API_SECRET</code> (and <code>RENTVINE_BASE_URL</code>) on the service to
          load live accounting figures.
        </p>
      </div>
    );
  }

  const [cash, reimb] = await Promise.all([fetchCashOnHand(), fetchReimbursables()]);
  const asOf = (cash.ok && cash.asOf) || (reimb.ok && reimb.asOf) || "";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink">Accounting</h1>
        {asOf && <span className="text-xs text-slate-400">As of {asOf}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Live from Rentvine — cash across the bank accounts, and what&apos;s outstanding on the
        reimbursables account.
      </p>

      <CashOnHand cash={cash} />
      <Reimbursables reimb={reimb} />
    </div>
  );
}

function CashOnHand({ cash }: { cash: CashOnHandResult }) {
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

function Reimbursables({ reimb }: { reimb: ReimbursablesResult }) {
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
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Charged</th>
                      <th className="px-3 py-2 text-right font-medium">Reimbursed</th>
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
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                          {r.charges ? formatCurrency(r.charges) : ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700">
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
