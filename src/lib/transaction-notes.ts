// Notes on a bank/card transaction (Accounting → Bank Transactions → Notes):
// a thread like the work-order notes (src/lib/work-order-notes.ts), stored in
// transaction_notes (see src/lib/plaid-sync.ts for the table + the one-time
// copy of the old single Notes field). Nobody is emailed unless the writer
// clicks "Add note & email", and only people with Accounting access can be
// picked — the email carries card details. Pure helpers here.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "2026-11-04" → "Nov 4"
function shortDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Same rule as canAccessAccounting (src/lib/accounting-access.ts), applied to a
// Supabase user record: admins (role claim, or the inspection app's
// can_delete / can_edit_all flags) plus ACCOUNTING_ALLOWED_EMAILS.
export function isAccountingStaff(
  appMetadata: Record<string, unknown> | undefined,
  email: string,
  allowedEmails: string[]
): boolean {
  const app = appMetadata ?? {};
  if (app.role === "admin" || app.can_delete === true || app.can_edit_all === true) return true;
  const e = email.trim().toLowerCase();
  return !!e && allowedEmails.includes(e);
}

export function transactionNoteEmail(n: {
  date: string | null;
  merchant: string;
  account: string;
  amount: number;
  property: string;
  author: string;
  body: string;
  appUrl: string;
}): { subject: string; html: string } {
  const when = shortDate(n.date);
  const subject = ["Note on " + money(n.amount), n.merchant, when].filter(Boolean).join(" · ");
  const facts = [when, n.account, n.property].filter(Boolean).map(esc).join(" · ");
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1e293b">
  <p style="margin:0 0 4px"><strong>${esc(n.author)}</strong> left a note on <strong>${esc(money(n.amount))} · ${esc(n.merchant)}</strong></p>
  <p style="margin:0 0 12px;color:#64748b">${facts}</p>
  <div style="border-left:3px solid #FF6F00;padding:8px 12px;background:#f8fafc;white-space:normal">${esc(n.body).replace(/\n/g, "<br>")}</div>
  <p style="margin:12px 0 0;font-size:13px"><a href="${esc(n.appUrl)}">Open Bank Transactions in PM Central</a></p>
  <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Reply to this email to answer ${esc(n.author)} directly.</p>
</div>`.trim();
  return { subject, html };
}
