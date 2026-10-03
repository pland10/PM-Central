// The entities that can send an invoice, ported from the standalone invoicing
// app. Each keeps its own number sequence (prefix) — two sets of books, two
// sequences. A copy of `from` is written onto every invoice row, so an invoice
// keeps the details it was issued under even if these change later.
//
// Logos are served from /public/invoicing/ (see logoSrc); the invoice sheet /
// print view uses them.

export type BillingPartyKey = "lms" | "pmi";

export type BillingParty = {
  key: BillingPartyKey;
  label: string;
  prefix: string;
  short: string;
  notes: string;
  logoSrc: string;
  logoWidth: number;
  from: { name: string; addr: string; contact: string; extra: string };
};

export const BILLING_PARTIES: Record<BillingPartyKey, BillingParty> = {
  lms: {
    key: "lms",
    label: "Lighthouse Maintenance Services",
    prefix: "LMS-",
    short: "LMS",
    notes: "Make checks payable to Lighthouse Maintenance Services LLC.",
    logoSrc: "/invoicing/logo-lms.jpg",
    logoWidth: 175,
    from: {
      name: "Lighthouse Maintenance Services",
      addr: "25 Melville Park Rd, Suite 229E\nMelville, NY 11747",
      contact: "631-600-3616",
      extra: "",
    },
  },
  pmi: {
    key: "pmi",
    label: "PMI Lighthouse",
    prefix: "PMI-",
    short: "PMI Lighthouse",
    notes:
      "Make checks payable to PMI Lighthouse.\n\nOther payment options are Zelle or check. Please note the new Zelle account.\n\nZelle can be sent to:\n516-241-8075\n\nChecks can be sent to:\nPMI Lighthouse\n25 Melville Park Rd, Suite 229E\nMelville, NY 11747",
    logoSrc: "/invoicing/logo-pmi.jpg",
    logoWidth: 215,
    from: {
      name: "PMI Lighthouse",
      addr: "25 Melville Park Rd, Suite 229E\nMelville, NY 11747",
      contact: "631-600-3616",
      extra: "",
    },
  },
};

export const DEFAULT_PARTY: BillingPartyKey = "lms";

export function partyOf(key: string | null | undefined): BillingParty {
  return BILLING_PARTIES[(key as BillingPartyKey) in BILLING_PARTIES ? (key as BillingPartyKey) : DEFAULT_PARTY];
}

export const DEFAULT_BILL_TO = {
  name: "PMI Lighthouse",
  addr: "25 Melville Park Rd, Suite 229E\nMelville, NY 11747",
  contact: "631-600-3616",
  extra: "Attn: Jasper",
};
