"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { partyOf } from "@/config/invoicing-parties";
import { periodLabel } from "@/lib/billing";
import { formatCurrencyCents } from "@/lib/format";

export type BillingRow = {
  customerId: string;
  name: string;
  billingParty: string;
  service: string;
  rate: number;
  invoice: { id: string; number: string; status: string } | null;
};

const STATUS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export function BillingView({
  periodKey,
  rows,
  expected,
  hasCustomers,
}: {
  periodKey: string;
  rows: BillingRow[];
  expected: number;
  hasCustomers: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // "all" or a customer id
  const [error, setError] = useState("");
  const missing = rows.filter((r) => !r.invoice);
  const label = periodLabel(periodKey);

  async function bill(customerIds?: string[]) {
    setBusy(customerIds?.[0] ?? "all");
    setError("");
    try {
      const res = await fetch("/api/invoicing/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_key: periodKey, ...(customerIds ? { customer_ids: customerIds } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      if (d.errors?.length) setError(`${d.errors.length} invoice(s) could not be created: ${d.errors[0].error}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-ink">Billing run</h1>
        <label className="text-sm text-slate-500" htmlFor="period">
          Period
        </label>
        <input
          id="period"
          type="month"
          value={periodKey}
          onChange={(e) => e.target.value && router.push(`/invoicing/billing?period=${e.target.value}`)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="text-sm text-slate-500">
          {rows.length} customer{rows.length === 1 ? "" : "s"} due · {formatCurrencyCents(expected)} expected
        </span>
        {missing.length > 0 && (
          <button
            onClick={() => bill()}
            disabled={busy !== null}
            className="ml-auto rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy === "all" ? "Creating…" : `Create ${missing.length} missing invoice${missing.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!hasCustomers ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No customers yet.{" "}
          <Link href="/invoicing/customers" className="font-medium text-brand-600 hover:underline">
            Add your first customer
          </Link>
        </div>
      ) : (
        <>
          <div
            className={`mb-3 rounded-md px-3 py-2 text-sm ${
              missing.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {missing.length
              ? `${missing.length} not yet invoiced for ${label}.`
              : rows.length
                ? `Everyone due for ${label} has been invoiced.`
                : `No customers are due to be billed in ${label}.`}
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">From</th>
                    <th className="px-4 py-2.5 font-semibold">Service</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.customerId}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{partyOf(r.billingParty).short}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.service}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyCents(r.rate)}</td>
                      <td className="px-4 py-2.5">
                        {r.invoice ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${STATUS[r.invoice.status] ?? STATUS.draft}`}>
                            {r.invoice.status}
                          </span>
                        ) : (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">not billed</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.invoice ? (
                          <Link href={`/invoicing/${r.invoice.id}/edit`} className="font-medium text-brand-600 hover:underline">
                            {r.invoice.number}
                          </Link>
                        ) : (
                          <button
                            onClick={() => bill([r.customerId])}
                            disabled={busy !== null}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busy === r.customerId ? "Creating…" : "Create invoice"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Rentvine still carries the charge and the money owed. This is the invoice document and the record that it went out.
          </p>
        </>
      )}
    </div>
  );
}
