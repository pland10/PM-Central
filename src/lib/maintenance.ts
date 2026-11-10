import type { WorkOrderRow } from "@/lib/work-orders";

// Maintenance view (the new work-order screen, behind FEATURE_MAINTENANCE):
// which work orders need attention and the KPI tiles — all
// derived from the synced rows (LeadSimple stages + dates, Rentvine priority and
// latest update). Pure functions with `now` injected, so they're testable and
// safe to import from client components.

export const STALLED_DAYS = 3; // open with no activity for longer than this
// In an estimate stage ("Estimate Requested", "Multiple Estimates") with no
// activity for longer than this. Estimates are tracked by LeadSimple stage —
// Rentvine holds almost none — and LeadSimple doesn't expose when a stage was
// entered, so the last activity is the signal.
export const ESTIMATE_WAIT_DAYS = 3;
export const COMPLETED_WINDOW_DAYS = 7;
const DAY = 86_400_000;

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// Last real activity: the later of LeadSimple's updated_at and the newest
// Rentvine work-order update note.
export function lastActivityAt(r: WorkOrderRow): string | null {
  const a = ms(r.updatedAt);
  const b = ms(r.lastUpdateAt);
  if (a == null && b == null) return null;
  return (a ?? -Infinity) >= (b ?? -Infinity) ? r.updatedAt : r.lastUpdateAt;
}

// In the "New WO" stage — an untriaged work order needs action right away, so
// it's flagged the moment it appears (no waiting period).
function isNewWaiting(r: WorkOrderRow): boolean {
  return !r.terminal && /^new wo$/i.test(r.stage.trim());
}

export type AttentionKind = "rvClosed" | "rvOnHold" | "estimates" | "overdue" | "high" | "new" | "stalled";
export type AttentionReason = { kind: AttentionKind; label: string };
// "estimates" outranks "overdue": LeadSimple sets every due date to created +
// 30 days, so Overdue is mostly age, while a stuck estimate is a specific ask.
const KIND_RANK: Record<AttentionKind, number> = { rvClosed: 0, rvOnHold: 1, estimates: 2, overdue: 3, high: 4, new: 5, stalled: 6 };

// Why an open work order needs someone, most urgent reason first; null if it
// doesn't (or it's closed).
export function attentionReason(r: WorkOrderRow, now: number): AttentionReason | null {
  if (r.terminal) return null;
  // Closed in Rentvine but still open in LeadSimple: the two systems disagree, so
  // one needs fixing (close it in LeadSimple, or reopen it in Rentvine). The label
  // names both sides; it outranks Overdue/Stalled.
  if (/^(completed|cancell?ed|canceled)$/i.test(r.rvStatus.trim())) {
    return { kind: "rvClosed", label: `${r.rvStatus.trim()} in Rentvine · open in LeadSimple` };
  }
  // On Hold in Rentvine but still in an active LeadSimple stage: it should be
  // Deferred in LeadSimple (which takes it off this list). Flagged instead of
  // Overdue/Stalled, since the hold is why it isn't moving.
  if (/^on ?hold$/i.test(r.rvStatus.trim())) {
    return { kind: "rvOnHold", label: "On Hold in Rentvine · open in LeadSimple" };
  }
  // Preventive work (tune-ups, winterization) is routine — it only needs
  // someone once it's overdue. The Rentvine mismatches above still flag it.
  if (r.preventive) {
    const due = ms(r.dueAt);
    return due != null && due < now ? { kind: "overdue", label: "Overdue" } : null;
  }
  const last = ms(lastActivityAt(r));
  if (/estimate/i.test(r.stage) && last != null && last < now - ESTIMATE_WAIT_DAYS * DAY) {
    return { kind: "estimates", label: `Waiting on estimates ${Math.floor((now - last) / DAY)} days` };
  }
  const due = ms(r.dueAt);
  if (due != null && due < now) return { kind: "overdue", label: "Overdue" };
  if (r.priority === "High") return { kind: "high", label: "High priority" };
  if (isNewWaiting(r)) return { kind: "new", label: "New WO needs action" };
  if (last != null && last < now - STALLED_DAYS * DAY) {
    return { kind: "stalled", label: `Stalled ${Math.floor((now - last) / DAY)} days` };
  }
  return null;
}

export const isCancelled = (r: WorkOrderRow) => /cancel/i.test(r.stage);

// Sort key for the merged Work Orders table: flagged work orders first (most
// urgent reason first, matching the attention queue's order), then open-but-fine,
// then completed, then cancelled.
export function actionRank(r: WorkOrderRow, now: number): number {
  const reason = attentionReason(r, now);
  if (reason) return KIND_RANK[reason.kind];
  if (!r.terminal) return 10;
  return isCancelled(r) ? 21 : 20;
}

export type RowStatus = "completed" | "cancelled" | "attention" | "open";
export function rowStatus(r: WorkOrderRow, now: number): RowStatus {
  if (r.terminal) return isCancelled(r) ? "cancelled" : "completed";
  return attentionReason(r, now) ? "attention" : "open";
}

export type MaintenanceKpis = {
  open: number;
  openReactive: number; // open = openReactive + openPreventive
  openPreventive: number;
  stalled: number;
  overdue: number;
  newWaiting: number;
  completedThisWeek: number;
  hasDueDates: boolean; // false until the sync captures due dates — show "—", not 0
};

export function maintenanceKpis(rows: WorkOrderRow[], now: number): MaintenanceKpis {
  const open = rows.filter((r) => !r.terminal);
  const staleBefore = now - STALLED_DAYS * DAY;
  const openPreventive = open.filter((r) => r.preventive).length;
  return {
    open: open.length,
    openReactive: open.length - openPreventive,
    openPreventive,
    // Counted independently of the "most urgent" reason, so an overdue WO
    // that's also quiet still counts as stalled.
    // Stalled / New-waiting leave out preventive work (routine, and kept off
    // the attention list); Open and Overdue still count it.
    stalled: open.filter((r) => {
      if (r.preventive) return false;
      const last = ms(lastActivityAt(r));
      return last != null && last < staleBefore;
    }).length,
    overdue: open.filter((r) => {
      const due = ms(r.dueAt);
      return due != null && due < now;
    }).length,
    newWaiting: open.filter((r) => !r.preventive && isNewWaiting(r)).length,
    completedThisWeek: rows.filter((r) => {
      const closed = ms(r.closedAt);
      return r.terminal && !isCancelled(r) && closed != null && closed >= now - COMPLETED_WINDOW_DAYS * DAY && closed <= now;
    }).length,
    hasDueDates: rows.some((r) => r.dueAt),
  };
}

export type QueueItem = { row: WorkOrderRow; reason: AttentionReason };

// "Work orders requiring attention": most urgent kind first; within a kind the
// one that's been quiet longest first.
export function attentionQueue(rows: WorkOrderRow[], now: number, limit = 8): QueueItem[] {
  return rows
    .map((row) => ({ row, reason: attentionReason(row, now) }))
    .filter((q): q is QueueItem => q.reason !== null)
    .sort((a, b) => {
      const k = KIND_RANK[a.reason.kind] - KIND_RANK[b.reason.kind];
      if (k) return k;
      return (ms(lastActivityAt(a.row)) ?? 0) - (ms(lastActivityAt(b.row)) ?? 0);
    })
    .slice(0, limit);
}
