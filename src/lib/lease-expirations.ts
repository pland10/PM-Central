// Lease-expiration summary for the dashboard: how many active leases end in
// each window. Days are rounded the same way as the list's "in Nd" / "Nd ago"
// labels, so a lease shown as "in 30d" is counted in 0–30.
export interface ExpirationBuckets {
  expired: number; // end date already passed
  d0to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
}

const DAY_MS = 86_400_000;

export function expirationBuckets(endMs: number[], now: number): ExpirationBuckets {
  const b: ExpirationBuckets = { expired: 0, d0to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 };
  for (const end of endMs) {
    const days = Math.round((end - now) / DAY_MS);
    if (days < 0) b.expired++;
    else if (days <= 30) b.d0to30++;
    else if (days <= 60) b.d31to60++;
    else if (days <= 90) b.d61to90++;
    else b.d90plus++;
  }
  return b;
}
