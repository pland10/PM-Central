import type { InspectionRow, InspectionProperty, ChecklistItem, WorkItem, MoveInMeta } from "./types";
import { formatInspectionDate, parseSpecialInstructions, isNotApplicable } from "./types";
import { buildMoveInSections, isMoveInType } from "./move-in-template";

// Builds the inspection summary email (subject + HTML) from an inspection's
// data. Pure/presentational — the send route (api/inspections/[id]/send-summary)
// gathers the data, picks which photos to attach, and calls sendEmail.

export type SummaryInput = {
  inspection: InspectionRow;
  property: InspectionProperty | null;
  checklist: ChecklistItem[];
  workItems: WorkItem[];
  attachedPhotoCount: number;
  ownerMessage?: string;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isIssue(c: ChecklistItem): boolean {
  if (isNotApplicable(c.status)) return false;
  return /issue|fail|bad|poor/i.test(c.status ?? "") || Boolean(c.issue_notes);
}

export function buildInspectionSummary(input: SummaryInput): { subject: string; html: string } {
  const { inspection: i, property, checklist, workItems, attachedPhotoCount } = input;
  const ownerMessage = (input.ownerMessage ?? "").trim();

  const propName = property?.name || property?.address || "Property";
  const dateStr = formatInspectionDate(i.inspection_date) || i.inspection_date || "";

  if (isMoveInType(i.inspection_type)) {
    return buildMoveInSummary(input, propName, dateStr, ownerMessage);
  }

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
          const na = isNotApplicable(c.status);
          const mark = na ? "–" : c.checked ? "✓" : "○";
          const statusBadge = c.status
            ? `<span style="font-size:12px;color:${issue ? "#b91c1c" : na ? "#94a3b8" : "#047857"}">${esc(c.status)}</span>`
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

    ${
      ownerMessage
        ? `<div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">
             <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:4px">Message</div>
             <p style="margin:0;color:#0f172a;white-space:pre-line">${esc(ownerMessage)}</p>
           </div>`
        : ""
    }

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

// Move-in summary: the room-by-room survey grouped by the template's sections,
// with header details and typed signatures.
function buildMoveInSummary(
  input: SummaryInput,
  propName: string,
  dateStr: string,
  ownerMessage: string
): { subject: string; html: string } {
  const { inspection: i, property, checklist, attachedPhotoCount } = input;
  const m: MoveInMeta = i.meta ?? {};
  const byKey = new Map(checklist.map((c) => [c.item_key ?? "", c]));
  const subject = `Move-In Inspection — ${propName}${dateStr ? ` — ${dateStr}` : ""}`;

  const section = (title: string, body: string) =>
    `<h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${esc(title)}</h3>${body}`;

  const sectionsHtml = buildMoveInSections(m).map((sec) => {
    const rows = sec.items
      .map((item) => {
        const saved = byKey.get(item.key);
        const note = saved?.issue_notes || "";
        const working = item.kind === "working" ? saved?.status || "" : "";
        if (!note && !working) return ""; // omit items with no answer
        const badge = working
          ? `<span style="font-size:12px;color:${working === "Yes" ? "#047857" : "#b91c1c"}">${esc(working)}</span>`
          : "";
        const noteHtml = note
          ? `<div style="font-size:12px;color:#64748b">${item.kind === "value" ? "" : "Condition: "}${esc(note)}</div>`
          : "";
        return `<tr style="border-top:1px solid #f1f5f9">
          <td style="padding:6px 8px 6px 0;color:#334155">${esc(item.label)}${noteHtml}</td>
          <td style="padding:6px 0;text-align:right;vertical-align:top">${badge}</td>
        </tr>`;
      })
      .join("");
    if (!rows) return "";
    return section(sec.title, `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`);
  }).join("");

  const sig = (role: string, name?: string, date?: string) =>
    name
      ? `<td style="padding:8px 12px 8px 0"><div style="font-size:12px;color:#64748b">${esc(role)}</div><div style="color:#0f172a">${esc(name)}</div><div style="font-size:12px;color:#94a3b8">${date ? esc(formatInspectionDate(date)) : ""}</div></td>`
      : "";
  const sigRow = sig("Tenant", m.tenantSigName, m.tenantSigDate) + sig("Property manager", m.pmSigName, m.pmSigDate);

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <div style="border-bottom:2px solid #e2e8f0;padding-bottom:10px">
      <div style="font-size:18px;font-weight:600">${esc(propName)}</div>
      ${property?.address ? `<div style="color:#64748b;font-size:14px">${esc(property.address)}</div>` : ""}
      <div style="margin-top:6px"><span style="display:inline-block;background:#eef2ff;color:#4338ca;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600">Move-In Inspection</span></div>
    </div>

    ${
      ownerMessage
        ? `<div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:4px">Message</div><p style="margin:0;color:#0f172a;white-space:pre-line">${esc(ownerMessage)}</p></div>`
        : ""
    }

    <table style="margin-top:12px;font-size:14px;border-collapse:collapse">
      ${m.tenantNames ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Tenant(s)</td><td style="padding:2px 0;color:#0f172a">${esc(m.tenantNames)}</td></tr>` : ""}
      ${m.moveInDate ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Move-in date</td><td style="padding:2px 0;color:#0f172a">${esc(formatInspectionDate(m.moveInDate))}</td></tr>` : ""}
      ${dateStr ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Inspected</td><td style="padding:2px 0;color:#0f172a">${esc(dateStr)}</td></tr>` : ""}
      ${i.inspector_name ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Inspector</td><td style="padding:2px 0;color:#0f172a">${esc(i.inspector_name)}</td></tr>` : ""}
    </table>

    ${sectionsHtml}
    ${i.notes ? section("Additional notes", `<p style="margin:4px 0 0;color:#334155;white-space:pre-line">${esc(i.notes)}</p>`) : ""}
    ${sigRow ? section("Signatures", `<table style="font-size:14px;border-collapse:collapse"><tr>${sigRow}</tr></table>`) : ""}

    ${attachedPhotoCount > 0 ? `<p style="margin-top:20px;color:#64748b;font-size:13px">📎 ${attachedPhotoCount} photo${attachedPhotoCount === 1 ? "" : "s"} attached.</p>` : ""}

    <p style="margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:10px">Sent from PMI Lighthouse inspections.</p>
  </div>`;

  return { subject, html };
}
