// Pure KPI aggregations for the Management Dashboard. No DB access — these
// operate on data already loaded (work orders, archive timestamps), so they're
// unit-tested in isolation. The server loader (management-dashboard.ts) fetches
// the data and runs these.
import type { WorkOrderRow } from "@/lib/work-orders";

const DAY = 86_400_000;

// Monday-start week key (YYYY-MM-DD of that Monday, in UTC) for a date.
export function weekStart(d: Date): string {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
  const monday = t - ((dow + 6) % 7) * DAY;
  return new Date(monday).toISOString().slice(0, 10);
}

// The last `weeks` Monday keys, oldest first, ending at the week containing `now`.
export function recentWeekStarts(now: Date, weeks: number): string[] {
  const end = weekStart(now);
  const endMs = Date.parse(end + "T00:00:00Z");
  const out: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push(new Date(endMs - i * 7 * DAY).toISOString().slice(0, 10));
  return out;
}

// Short axis label for a Monday week key, e.g. "Nov 10".
export function weekLabel(weekKey: string): string {
  const d = new Date(weekKey + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Count ISO timestamps into their Monday-week buckets, aligned to the recent
// window (weeks with no items are present with 0).
export function tallyByWeek(isoDates: (string | null | undefined)[], weeks: number, now: Date): Map<string, number> {
  const keys = recentWeekStarts(now, weeks);
  const first = keys[0];
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const iso of isoDates) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    const k = weekStart(new Date(t));
    if (k < first) continue; // older than the window
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export type WeekPoint = { week: string; label: string; opened: number; closed: number };

// Work orders opened (by createdAt) vs closed (by closedAt) per week.
export function openedClosedByWeek(wos: WorkOrderRow[], weeks: number, now: Date): WeekPoint[] {
  const opened = tallyByWeek(wos.map((w) => w.createdAt), weeks, now);
  const closed = tallyByWeek(
    wos.filter((w) => w.terminal).map((w) => w.closedAt),
    weeks,
    now
  );
  return recentWeekStarts(now, weeks).map((week) => ({
    week,
    label: weekLabel(week),
    opened: opened.get(week) ?? 0,
    closed: closed.get(week) ?? 0,
  }));
}

export type StageCount = { stage: string; count: number };

// Current open-work-order backlog grouped by stage, largest first.
export function backlogByStage(wos: WorkOrderRow[]): StageCount[] {
  const by = new Map<string, number>();
  for (const w of wos) {
    if (w.terminal) continue;
    const stage = w.stage || "—";
    by.set(stage, (by.get(stage) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
}

// Preventive vs reactive split among open work orders.
export function preventiveSplit(wos: WorkOrderRow[]): { preventive: number; reactive: number } {
  let preventive = 0;
  let reactive = 0;
  for (const w of wos) {
    if (w.terminal) continue;
    if (w.preventive) preventive++;
    else reactive++;
  }
  return { preventive, reactive };
}

// Median calendar days from open to close, over work orders closed within the
// last `sinceDays`. null when none qualify.
export function medianDaysToClose(wos: WorkOrderRow[], sinceDays: number, now: Date): number | null {
  const cutoff = now.getTime() - sinceDays * DAY;
  const spans: number[] = [];
  for (const w of wos) {
    if (!w.terminal || !w.closedAt || !w.createdAt) continue;
    const closed = Date.parse(w.closedAt);
    const created = Date.parse(w.createdAt);
    if (Number.isNaN(closed) || Number.isNaN(created) || closed < cutoff || closed < created) continue;
    spans.push((closed - created) / DAY);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a - b);
  const mid = Math.floor(spans.length / 2);
  const median = spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
  return Math.round(median * 10) / 10;
}

export type WorkOrderHeadline = {
  open: number;
  openedThisWeek: number;
  closedThisWeek: number;
  medianDaysToClose: number | null;
  preventiveShare: number; // % of open that is preventive, 0–100
};

export function workOrderHeadline(wos: WorkOrderRow[], now: Date): WorkOrderHeadline {
  const thisWeek = weekStart(now);
  const open = wos.filter((w) => !w.terminal).length;
  const inWeek = (iso: string | null) => !!iso && weekStart(new Date(Date.parse(iso))) === thisWeek;
  const { preventive } = preventiveSplit(wos);
  return {
    open,
    openedThisWeek: wos.filter((w) => inWeek(w.createdAt)).length,
    closedThisWeek: wos.filter((w) => w.terminal && inWeek(w.closedAt)).length,
    medianDaysToClose: medianDaysToClose(wos, 90, now),
    preventiveShare: open > 0 ? Math.round((preventive / open) * 100) : 0,
  };
}

export type ArchivePoint = { week: string; label: string; count: number };

// Accounting rows archived per week, from their archived_at timestamps.
export function archivedByWeek(archivedAt: (string | null)[], weeks: number, now: Date): ArchivePoint[] {
  const counts = tallyByWeek(archivedAt, weeks, now);
  return recentWeekStarts(now, weeks).map((week) => ({ week, label: weekLabel(week), count: counts.get(week) ?? 0 }));
}

// ---- Collections & Rent (bundle A) ----

const round2 = (n: number) => Math.round(n * 100) / 100;

// A tenant rent payment (payments table, source_id rvpay_*): the status, the
// dollar amount, and when the tenant paid (date_posted).
export type PaymentRow = { datePosted: string | null; amount: number; status: string };

// Statuses that count as money received (vs returned / voided).
const RECEIVED = new Set(["cleared", "pending", "non_ach"]);

export type MoneyWeekPoint = { week: string; label: string; amount: number };

// Rent collected per week — sum of received payment amounts by the week the
// tenant paid (date_posted). Answers "when did rent come in?".
export function rentCollectedByWeek(payments: PaymentRow[], weeks: number, now: Date): MoneyWeekPoint[] {
  const keys = recentWeekStarts(now, weeks);
  const first = keys[0];
  const sums = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of payments) {
    if (!RECEIVED.has(p.status) || !p.datePosted) continue;
    const t = Date.parse(p.datePosted);
    if (Number.isNaN(t)) continue;
    const k = weekStart(new Date(t));
    if (k < first || !sums.has(k)) continue;
    sums.set(k, (sums.get(k) ?? 0) + (Number(p.amount) || 0));
  }
  return keys.map((week) => ({ week, label: weekLabel(week), amount: round2(sums.get(week) ?? 0) }));
}

export type CountWeekPoint = { week: string; label: string; count: number };

// Returned / NSF payments per week, by the week the tenant paid.
export function returnsByWeek(payments: PaymentRow[], weeks: number, now: Date): CountWeekPoint[] {
  const counts = tallyByWeek(
    payments.filter((p) => p.status === "returned").map((p) => p.datePosted),
    weeks,
    now
  );
  return recentWeekStarts(now, weeks).map((week) => ({ week, label: weekLabel(week), count: counts.get(week) ?? 0 }));
}

export type CollectionsHeadline = {
  collectedThisWeek: number; // $ received, date_posted this week
  pendingTotal: number; // $ currently in flight (status = pending)
  returnedThisWeek: number; // # returned, date_posted this week
  returnedTotalWindow: number; // # returned across the loaded window
};

export function collectionsHeadline(payments: PaymentRow[], now: Date): CollectionsHeadline {
  const thisWeek = weekStart(now);
  const inThisWeek = (d: string | null) => !!d && !Number.isNaN(Date.parse(d)) && weekStart(new Date(Date.parse(d))) === thisWeek;
  let collectedThisWeek = 0;
  let pendingTotal = 0;
  let returnedThisWeek = 0;
  let returnedTotalWindow = 0;
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    if (RECEIVED.has(p.status) && inThisWeek(p.datePosted)) collectedThisWeek += amt;
    if (p.status === "pending") pendingTotal += amt;
    if (p.status === "returned") {
      returnedTotalWindow++;
      if (inThisWeek(p.datePosted)) returnedThisWeek++;
    }
  }
  return {
    collectedThisWeek: round2(collectedThisWeek),
    pendingTotal: round2(pendingTotal),
    returnedThisWeek,
    returnedTotalWindow,
  };
}
