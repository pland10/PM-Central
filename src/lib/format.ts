export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Exact money, to the cent — for screens where the individual amounts matter
// (e.g. the trust-draw batching), not the rounded dashboard figures.
export function formatCurrencyCents(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatAddress(p: {
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
}): string {
  const line1 = [p.street1, p.street2].filter(Boolean).join(", ");
  return `${line1}, ${p.city}, ${p.state} ${p.zip}`;
}

// Absolute timestamp in the business timezone (Eastern), zone spelled out so
// it's unambiguous — e.g. "Oct 7, 2:04 PM EDT". A fixed TZ keeps the
// server-rendered value stable (no client/server hydration mismatch).
export function formatEasternTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(d);
}

// "Balances as of …" for the dashboard's Delinquencies panel, from the balance
// sync's heartbeat (sync_status job 'balances'). null when it has never run.
export function balancesAsOf(lastRunAt: Date | string | null | undefined): string | null {
  if (!lastRunAt) return null;
  const d = new Date(lastRunAt);
  return Number.isNaN(d.getTime()) ? null : `Balances as of ${formatEasternTimestamp(d)}`;
}
