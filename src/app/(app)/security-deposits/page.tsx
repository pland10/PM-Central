import { requireFeature } from "@/config/features";
import { formatCurrency } from "@/lib/format";
import { fetchSecurityDeposits, isRentvineConfigured } from "@/lib/security-deposits";
import { SecurityDepositsTable } from "./SecurityDepositsTable";

// Live security-deposit breakdown from Rentvine, showing the honest trust
// liability: PMI-held on active leases, PMI-held pending refund (moved out),
// and owner-held (excluded), rather than the report's combined headline total.
export const dynamic = "force-dynamic";

export default async function SecurityDepositsPage() {
  requireFeature("securityDeposits");

  if (!isRentvineConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold text-ink">Security Deposits</h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rentvine isn&apos;t configured for this environment. Set <code>RENTVINE_API_KEY</code> and{" "}
          <code>RENTVINE_API_SECRET</code> (and <code>RENTVINE_BASE_URL</code>) on the service to
          load live deposit balances.
        </p>
      </div>
    );
  }

  const result = await fetchSecurityDeposits();

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold text-ink">Security Deposits</h1>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load deposits from Rentvine: {result.error}
        </p>
      </div>
    );
  }

  const { rows, summary, asOf } = result;
  const pmiTotal = summary.pmiHeldActive + summary.pmiHeldMovedOut;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink">Security Deposits</h1>
        <span className="text-xs text-slate-400">As of {asOf}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        What PMI actually holds in trust, split from deposits held by owners and those pending a
        move-out refund. Rentvine&apos;s headline total combines all three.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="PMI held — active"
          value={formatCurrency(summary.pmiHeldActive)}
          hint="Trust liability"
          tone="emerald"
        />
        <Tile
          label="Pending refund"
          value={formatCurrency(summary.pmiHeldMovedOut)}
          hint="Moved out, still held"
          tone={summary.pmiHeldMovedOut > 0 ? "red" : "slate"}
        />
        <Tile
          label="Held by owner"
          value={formatCurrency(summary.ownerHeld)}
          hint="Not PMI's to hold"
          tone="amber"
        />
        <Tile
          label="Rentvine report total"
          value={formatCurrency(summary.reportTotal)}
          hint={`PMI ${formatCurrency(pmiTotal)} + owner ${formatCurrency(summary.ownerHeld)}`}
          tone="slate"
        />
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            No security deposit balances on record.
          </p>
        ) : (
          <SecurityDepositsTable rows={rows} />
        )}
      </div>
    </div>
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
  hint: string;
  tone: keyof typeof TONES | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${TONES[tone] || TONES.slate}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}
