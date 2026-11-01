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
