import { DAILY_RULE, formatRule, parseRule, type Adjust, type Frequency } from "@/lib/calendar/rules";

// Close-calendar events: what's due, when (a rule — see ./rules.ts), how often,
// and who owns it. Pure validation + the starter set; storage is ./db.ts.

export type CalendarEventInput = {
  title: string;
  description: string;
  rule: string; // canonical, e.g. "ME-5BD"; "DAILY" for every business day
  frequency: Frequency;
  month: number | null; // yearly: 1–12; quarterly: month of the quarter, 1–3; daily / monthly: null
  adjust: Adjust;
  ownerEmail: string | null;
};

// A task checked off for one month: who and when.
export type TaskStatus = { doneBy: string; doneByName: string; doneAt: string };

export type CalendarEvent = Omit<CalendarEventInput, "ownerEmail"> & {
  id: number;
  ownerEmail: string | null;
  ownerName: string | null;
  active: boolean;
};

const FREQUENCIES: Frequency[] = ["daily", "monthly", "quarterly", "yearly"];
const ADJUSTS: Adjust[] = ["prior", "next", "none"];
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;

export function sanitizeEvent(raw: unknown): { ok: true; value: CalendarEventInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!title) return { ok: false, error: "Give the event a name." };
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep the name under ${MAX_TITLE} characters.` };
  if (description.length > MAX_DESCRIPTION) return { ok: false, error: `Keep the description under ${MAX_DESCRIPTION} characters.` };

  const frequency = b.frequency as Frequency;
  if (!FREQUENCIES.includes(frequency)) return { ok: false, error: "Pick how often it repeats." };
  const ownerEmail = typeof b.ownerEmail === "string" && b.ownerEmail.trim() ? b.ownerEmail.trim().toLowerCase() : null;
  // Every business day: no date rule or month; weekends/holidays never apply.
  if (frequency === "daily") {
    return { ok: true, value: { title, description, rule: DAILY_RULE, frequency, month: null, adjust: "prior", ownerEmail } };
  }

  const parsed = parseRule(typeof b.rule === "string" ? b.rule : "");
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const adjust = (b.adjust ?? "prior") as Adjust;
  if (!ADJUSTS.includes(adjust)) return { ok: false, error: "Pick what happens on weekends and holidays." };

  let month: number | null = null;
  if (frequency !== "monthly") {
    const n = Number(b.month);
    const max = frequency === "yearly" ? 12 : 3;
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return { ok: false, error: frequency === "yearly" ? "Pick the month it happens in." : "Pick which month of the quarter (1st, 2nd or 3rd)." };
    }
    month = n;
  }

  return { ok: true, value: { title, description, rule: formatRule(parsed.rule), frequency, month, adjust, ownerEmail } };
}

// A standard property-management close, loaded once into an empty calendar for
// the team to edit. No owners — assign them on the Calendar page.
export const STARTER_EVENTS: Omit<CalendarEventInput, "ownerEmail">[] = [
  { title: "Confirm rent payments are posting", rule: "BD1", frequency: "monthly", month: null, adjust: "prior",
    description: "Check that rent and autopay payments are posting in Rentvine; follow up on anything missing." },
  { title: "Reconcile bank accounts", rule: "BD5", frequency: "monthly", month: null, adjust: "prior",
    description: "Reconcile operating, trust and security-deposit accounts to last month's bank statements (three-way reconciliation for trust)." },
  { title: "Assess late fees", rule: "D6", frequency: "monthly", month: null, adjust: "prior",
    description: "Charge late fees on rent still unpaid after the grace period. Set the day to match your leases and state rules." },
  { title: "Review owner statements", rule: "BD7", frequency: "monthly", month: null, adjust: "prior",
    description: "Review last month's owner statements before they go out." },
  { title: "Send delinquency notices", rule: "D10", frequency: "monthly", month: null, adjust: "prior",
    description: "Notices to tenants still behind — see the Delinquencies panel on the dashboard." },
  { title: "Send owner distributions", rule: "D12", frequency: "monthly", month: null, adjust: "prior",
    description: "Pay owners their distributions for last month." },
  { title: "Management fee draws (trust → operating)", rule: "D15", frequency: "monthly", month: null, adjust: "prior",
    description: "Batch the draws in Accounting → Rentvine Transactions, move the money, and confirm with the Chase transaction #." },
  { title: "Enter vendor bills before cutoff", rule: "ME-5BD", frequency: "monthly", month: null, adjust: "prior",
    description: "Enter the month's remaining vendor bills and receipts before the month-end cutoff." },
  { title: "Reimbursables review", rule: "ME-5", frequency: "monthly", month: null, adjust: "prior",
    description: "Make sure every reimbursable charge is billed in Rentvine and recorded in QuickBooks (Accounting → Bank Transactions)." },
  { title: "Follow up on uncleared checks", rule: "ME-3BD", frequency: "monthly", month: null, adjust: "prior",
    description: "Review outstanding checks older than 30 days; contact the payee, or void and reissue." },
  { title: "Month-end cutoff", rule: "BD-1", frequency: "monthly", month: null, adjust: "prior",
    description: "Last business day: the month's final deposits and payments are entered." },
  { title: "Check vendor insurance certificates", rule: "D15", frequency: "quarterly", month: 1, adjust: "prior",
    description: "Make sure each active vendor has a current certificate of insurance (COI) on file." },
  { title: "Collect missing W-9s", rule: "D1", frequency: "yearly", month: 12, adjust: "next",
    description: "Get a W-9 from every vendor and owner missing one, before 1099s are due." },
  { title: "Send 1099s", rule: "D31", frequency: "yearly", month: 1, adjust: "prior",
    description: "1099-NEC / 1099-MISC to vendors and owners, and file with the IRS (due January 31)." },
];
