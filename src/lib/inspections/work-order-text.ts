import type { InspectionDetailData } from "./db";
import { formatInspectionDate, isNotApplicable } from "./types";

// Build a default Rentvine work-order description from an inspection: the
// property + date, the checklist issues, and any work/service items. Kept pure
// so the UI can prefill the same text the resolve route falls back to.
export function buildWorkOrderDescription(detail: InspectionDetailData): string {
  const { inspection: i, property, checklist, workItems } = detail;
  const propName = property?.name || property?.address || "property";
  const dateStr = formatInspectionDate(i.inspection_date);

  const lines: string[] = [];
  lines.push(`From inspection of ${propName}${dateStr && dateStr !== "—" ? ` on ${dateStr}` : ""}.`);

  const issues = checklist.filter(
    (c) =>
      !isNotApplicable(c.status) &&
      (/issue|fail|bad|poor/i.test(c.status ?? "") || Boolean(c.issue_notes))
  );
  if (issues.length) {
    lines.push("", "Issues found:");
    for (const c of issues) {
      const label = c.item_label || c.item_key || "Item";
      lines.push(`- ${label}${c.issue_notes ? `: ${c.issue_notes}` : ""}`);
    }
  }

  if (workItems.length) {
    lines.push("", "Work items:");
    for (const w of workItems) {
      const qty = w.quantity && w.quantity !== 1 ? ` ×${w.quantity}` : "";
      lines.push(`- ${w.service_name || "Service"}${qty}${w.notes ? ` — ${w.notes}` : ""}`);
    }
  }

  if (i.notes) {
    lines.push("", `Notes: ${i.notes}`);
  }

  return lines.join("\n");
}
