// Rent-reminder emails sent from the Delinquencies dashboard panel. The person
// logged in picks which delinquent tenants to remind; the email goes out under
// their name (Reply-To their address) using the admin-editable template.
// Pure helpers here; storage + sending live in reminders-db.ts and the API.

export type ReminderTemplate = { subject: string; body: string };

// A delinquent lease the server resolved for sending: who, where, how much.
export type ReminderRecipient = {
  leaseId: string;
  tenant: string;
  property: string;
  email: string;
  amount: number;
};

export const DEFAULT_TEMPLATE: ReminderTemplate = {
  subject: "A reminder about your rent balance",
  body: `Dear Resident,

Our records show an outstanding balance of {balance} on your account for {property}. Please arrange payment at your earliest convenience.

If you have already made this payment, or you'd like to discuss your account, simply reply to this email.

Thank you,
PMI Lighthouse`,
};

// Merge fields the template may use. Unknown {tokens} are left untouched so a
// typo shows up plainly instead of silently vanishing.
export const MERGE_FIELDS = ["tenant", "property", "balance"] as const;

export function formatBalance(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function renderTemplate(text: string, r: Pick<ReminderRecipient, "tenant" | "property" | "amount">): string {
  const values: Record<string, string> = {
    tenant: r.tenant || "Resident",
    property: r.property || "your unit",
    balance: formatBalance(r.amount),
  };
  return text.replace(/\{(tenant|property|balance)\}/g, (_m, key: string) => values[key] ?? `{${key}}`);
}

// Trim + cap; an empty subject/body falls back to the default so a reminder is
// never blank.
export function normalizeTemplate(input: { subject?: unknown; body?: unknown }): ReminderTemplate {
  const subject = typeof input.subject === "string" ? input.subject.trim().slice(0, 300) : "";
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 8000) : "";
  return {
    subject: subject || DEFAULT_TEMPLATE.subject,
    body: body || DEFAULT_TEMPLATE.body,
  };
}

// The From header for a reminder: the sender's name on the verified Resend
// domain (Resend can only send from a verified domain), so replies — routed by
// Reply-To to the sender's own address — reach them, while the email reads as
// coming from them. `configuredFrom` is RESEND_FROM (or the app default).
export function senderFrom(userName: string, configuredFrom: string): string {
  const m = configuredFrom.match(/<([^>]+)>/);
  const addr = (m ? m[1] : configuredFrom).trim();
  const name = userName.replace(/["<>]/g, "").trim();
  return name ? `${name} <${addr}>` : configuredFrom;
}

// Plain-text body → simple HTML (escape, keep line breaks).
export function bodyToHtml(body: string): string {
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap">${esc}</div>`;
}
