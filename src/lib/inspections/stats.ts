import { needsAttention, type InspectionRow } from "./types";

// Figures for the summary pane at the top of the Inspections page. Pure (no DB)
// so it's unit-tested directly; the page computes it from the loaded rows.
export type InspectionStats = {
  total: number;
  thisWeek: number; // inspection_date in the Sun–Sat week containing `now`
  thisMonth: number; // inspection_date in the calendar month of `now`
  upcoming: number; // inspection_date in the future (scheduled ahead)
  overdue: number; // inspection_date in the past but still not done (blank/scheduled) and unhandled
  needsAttention: number; // warn/bad status not yet resolved or turned into a WO
};

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The date portion (YYYY-MM-DD) of an inspection_date, which may be a bare date
// or a full timestamp. Null when unset.
function dateOf(row: InspectionRow): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(row.inspection_date ?? "");
  return m ? m[1] : null;
}

function isHandled(r: InspectionRow): boolean {
  return r.resolution_status === "resolved" || r.resolution_status === "work_order";
}

// Whether a visit looks not-yet-done: no recorded outcome, or a status that
// still reads as scheduled/pending. A past-dated such visit is overdue.
function notDoneYet(status: string | null | undefined): boolean {
  const s = (status || "").trim().toLowerCase();
  return s === "" || /schedul|pending|upcoming|due/.test(s);
}

export function summarizeInspections(rows: InspectionRow[], now: Date = new Date()): InspectionStats {
  // Week runs Sunday–Saturday around `now`; compare as YYYY-MM-DD strings (ISO
  // dates sort lexically), all in UTC so the result doesn't drift by timezone.
  const dow = now.getUTCDay();
  const today = ymdUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const weekStart = ymdUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow)));
  const weekEnd = ymdUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow + 6)));
  const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  let thisWeek = 0;
  let thisMonth = 0;
  let upcoming = 0;
  let overdue = 0;
  let attention = 0;
  for (const r of rows) {
    const d = dateOf(r);
    if (d) {
      if (d >= weekStart && d <= weekEnd) thisWeek++;
      if (d.startsWith(monthPrefix)) thisMonth++;
      if (d > today) upcoming++;
      else if (d < today && notDoneYet(r.overall_status) && !isHandled(r)) overdue++;
    }
    if (needsAttention(r.overall_status) && !isHandled(r)) attention++;
  }
  return { total: rows.length, thisWeek, thisMonth, upcoming, overdue, needsAttention: attention };
}
