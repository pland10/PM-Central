import { monthLabel } from "@/lib/owner-draws";

// Notes on an owner's draws (Accounting → Owner Draws → Notes): a thread per
// owner (portfolio) across months, like the Bank Transactions and work-order
// notes. Each note is stamped with the month it was written for. Nobody is
// emailed unless the writer clicks "Add note & email", and only people with
// Accounting access can be picked. Pure helpers here; storage is
// ./owner-draw-notes-db.ts.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ownerDrawNoteEmail(n: {
  name: string;
  month: string;
  author: string;
  body: string;
  appUrl: string;
}): { subject: string; html: string } {
  const month = monthLabel(n.month);
  const subject = ["Owner draw note", n.name, month].filter(Boolean).join(" · ");
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1e293b">
  <p style="margin:0 0 4px"><strong>${esc(n.author)}</strong> left a note on <strong>${esc(n.name)}</strong></p>
  <p style="margin:0 0 12px;color:#64748b">Owner draws · ${esc(month)}</p>
  <div style="border-left:3px solid #FF6F00;padding:8px 12px;background:#f8fafc;white-space:normal">${esc(n.body).replace(/\n/g, "<br>")}</div>
  <p style="margin:12px 0 0;font-size:13px"><a href="${esc(n.appUrl)}">Open Owner Draws in PM Central</a></p>
  <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Reply to this email to answer ${esc(n.author)} directly.</p>
</div>`.trim();
  return { subject, html };
}
