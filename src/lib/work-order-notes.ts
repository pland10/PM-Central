// Notes on a work order, written in PM-Central (Work Orders list → Notes). They
// stay in this app — internal coordination, not the job's record in Rentvine —
// and nobody is emailed unless the writer clicks "Add note & email" and picks a
// recipient. Pure helpers here; storage is work-order-notes-db.ts.

export type WorkOrderNote = {
  id: number;
  body: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  editedAt: string | null;
  emailedTo: string | null;
};

export type StaffMember = { name: string; email: string };

const BODY_MAX = 4000;

export function normalizeNoteBody(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const b = input.trim().slice(0, BODY_MAX);
  return b || null;
}

const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// The work order's assignee (a LeadSimple user name) → their PM-Central email.
export function matchStaffEmail(assignee: string, staff: StaffMember[]): string {
  const key = nameKey(assignee);
  if (!key) return "";
  return staff.find((s) => nameKey(s.name) === key)?.email ?? "";
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function noteEmail(n: {
  number: string;
  issue: string;
  property: string;
  author: string;
  body: string;
  appUrl: string;
  leadSimpleUrl?: string;
}): { subject: string; html: string } {
  const subject = `Note on WO #${n.number} — ${n.issue}`;
  const links = [
    `<a href="${esc(n.appUrl)}">Open Work Orders in PM-Central</a>`,
    n.leadSimpleUrl ? `<a href="${esc(n.leadSimpleUrl)}">Open in LeadSimple</a>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1e293b">
  <p style="margin:0 0 4px"><strong>${esc(n.author)}</strong> left a note on <strong>WO #${esc(n.number)}</strong> — ${esc(n.issue)}</p>
  <p style="margin:0 0 12px;color:#64748b">${esc(n.property)}</p>
  <div style="border-left:3px solid #FF6F00;padding:8px 12px;background:#f8fafc;white-space:normal">${esc(n.body).replace(/\n/g, "<br>")}</div>
  <p style="margin:12px 0 0;font-size:13px">${links}</p>
  <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Reply to this email to answer ${esc(n.author)} directly.</p>
</div>`.trim();
  return { subject, html };
}
