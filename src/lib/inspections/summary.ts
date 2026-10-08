import type { InspectionRow, InspectionProperty, ChecklistItem, WorkItem } from "./types";
import { formatInspectionDate, parseSpecialInstructions } from "./types";

// Builds the inspection summary email (subject + HTML) from an inspection's
// data. Pure/presentational — the send route (api/inspections/[id]/send-summary)
// gathers the data, picks which photos to attach, and calls sendEmail.

export type SummaryInput = {
  inspection: InspectionRow;
  property: InspectionProperty | null;
  checklist: ChecklistItem[];
  workItems: WorkItem[];
  attachedPhotoCount: number;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isIssue(c: ChecklistItem): boolean {
  return /issue|fail|bad|poor/i.test(c.status ?? "") || Boolean(c.issue_notes);
}

export function buildInspectionSummary(input: SummaryInput): { subject: string; html: string } {
  const { inspection: i, property, checklist, workItems, attachedPhotoCount } = input;

  const propName = property?.name || property?.address || "Property";
  const dateStr = formatInspectionDate(i.inspection_date) || i.inspection_date || "";
  const issues = checklist.filter(isIssue);

  const subject = `Inspection — ${propName}${dateStr ? ` — ${dateStr}` : ""}`;

  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;white-space:nowrap">${esc(label)}</td><td style="padding:2px 0;color:#0f172a">${esc(value)}</td></tr>`
      : "";

  const si = parseSpecialInstructions(i.special_instructions);
  const siHtml = si.states.length
    ? `<ul style="margin:4px 0 0;padding-left:18px;color:#334155">${si.states
        .map((s) => `<li>${s.checked ? "☑" : "☐"} ${esc(s.name)}</li>`)
        .join("")}</ul>`
    : si.text
      ? `<p style="margin:4px 0 0;color:#334155;white-space:pre-line">${esc(si.text)}</p>`
      : "";

  const checklistRows = checklist.length
    ? checklist
        .map((c) => {
          const issue = isIssue(c);
          const mark = c.checked ? "✓" : "○";
          const statusBadge = c.status
            ? `<span style="font-size:12px;color:${issue ? "#b91c1c" : "#047857"}">${esc(c.status)}</span>`
            : "";
          const notes = c.issue_notes
            ? `<div style="font-size:12px;color:#64748b">${esc(c.issue_notes)}</div>`
            : "";
          return `<tr style="border-top:1px solid #f1f5f9">
            <td style="padding:6px 8px 6px 0;color:${issue ? "#b91c1c" : "#334155"}">${mark} ${esc(c.item_label || c.item_key || "")}${notes}</td>
            <td style="padding:6px 0;text-align:right;vertical-align:top">${statusBadge}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td style="padding:6px 0;color:#94a3b8">No checklist recorded.</td></tr>`;

  const workRows = workItems.length
    ? workItems
        .map(
          (w) =>
            `<tr style="border-top:1px solid #f1f5f9"><td style="padding:6px 8px 6px 0;color:#334155">${esc(w.service_name || "")}${w.notes ? `<div style="font-size:12px;color:#64748b">${esc(w.notes)}</div>` : ""}</td><td style="padding:6px 0;text-align:right;color:#64748b">×${esc(w.quantity ?? 1)}</td></tr>`
        )
        .join("")
    : "";

  const section = (title: string, body: string) =>
    `<h3 style="margin:20px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${esc(title)}</h3>${body}`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <div style="border-bottom:2px solid #e2e8f0;padding-bottom:10px">
      <div style="font-size:18px;font-weight:600">${esc(propName)}</div>
      ${property?.address ? `<div style="color:#64748b;font-size:14px">${esc(property.address)}</div>` : ""}
      ${i.overall_status ? `<div style="margin-top:6px"><span style="display:inline-block;background:#f1f5f9;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;text-transform:capitalize">${esc(i.overall_status)}</span></div>` : ""}
    </div>

    <table style="margin-top:12px;font-size:14px;border-collapse:collapse">
      ${row("Date", dateStr)}
      ${row("Time", i.inspection_time || "")}
      ${row("Inspector", i.inspector_name || "")}
      ${row("Reason", i.inspection_reason || "")}
    </table>

    ${siHtml ? section("Special instructions", siHtml) : ""}
    ${i.notes ? section("Notes", `<p style="margin:4px 0 0;color:#334155;white-space:pre-line">${esc(i.notes)}</p>`) : ""}

    ${section(
      `Checklist${issues.length ? ` — ${issues.length} issue${issues.length === 1 ? "" : "s"}` : ""}`,
      `<table style="width:100%;border-collapse:collapse;font-size:14px">${checklistRows}</table>`
    )}

    ${workRows ? section("Work / service items", `<table style="width:100%;border-collapse:collapse;font-size:14px">${workRows}</table>`) : ""}

    ${attachedPhotoCount > 0 ? `<p style="margin-top:20px;color:#64748b;font-size:13px">📎 ${attachedPhotoCount} photo${attachedPhotoCount === 1 ? "" : "s"} attached.</p>` : ""}

    <p style="margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:10px">Sent from PMI Lighthouse inspections.</p>
  </div>`;

  return { subject, html };
}
