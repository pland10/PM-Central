import type { PushPayload } from "@/lib/push-send";

// Phase 3 scheduled notification triggers, run by the push-alerts cron:
//  - payment_nsf (admin broadcast): new returned/NSF payments
//  - wo_new      (admin broadcast): new / urgent work orders
//  - sync_failure(admin broadcast): a sync that has gone stale
//  - wo_assigned (personal): the stage of a work order you're the tech on changed
//  - calendar_tasks (personal): a close-calendar task you own is due today
//  - batch_ready (admin broadcast): new management-company draws (payments to
//    PMI Lighthouse in Rentvine) not yet in a batch — one summary per run
// A watermark of event keys (push-alerts-live.ts) dedups across runs; the key
// set is pruned to what's still "current" each run, so it stays bounded and a
// recovered condition re-arms. See src/app/api/cron/push-alerts/route.ts.

export type ReturnedPayment = { id: string; tenant: string | null; property: string | null; amount: number };
export type AttentionWorkOrder = {
  number: string;
  issue: string;
  property: string;
  priority: string;
  link: string;
  isNew: boolean;
  isHigh: boolean;
};
export type StaleSync = { id: string; label: string; cadence: string; lastRun: string | null };
export type AssignedWorkOrder = { woId: string; number: string; stage: string; issue: string; techEmail: string };
// A management-company draw that isn't in a batch yet (Rentvine payoutID).
export type ReadyDraw = { id: string; amount: number };
// A close-calendar task due today that isn't done, with its owner.
export type DueCalendarTask = { eventId: number; period: string; title: string; rule: string; ownerEmail: string };

export type PushAlertDeps = {
  // null = no state row yet (first run ever) — seed silently, don't backfill.
  loadSentIds(): Promise<string[] | null>;
  saveSentIds(ids: string[]): Promise<void>;
  returnedPayments(): Promise<ReturnedPayment[]>;
  attentionWorkOrders(): Promise<AttentionWorkOrder[]>;
  staleSyncs(): Promise<StaleSync[]>;
  assignedWorkOrderStages(): Promise<AssignedWorkOrder[]>;
  // Draws ready to batch, read live from Rentvine; null = couldn't tell (keep
  // what we knew rather than guess). Only called when someone wants batch_ready.
  readyDraws(): Promise<ReadyDraw[] | null>;
  calendarDueToday(): Promise<DueCalendarTask[]>;
  recipientsFor(category: string): Promise<string[]>;
  sendPush(emails: string[], payload: PushPayload): Promise<{ sent: number }>;
};

export type PushAlertResult = {
  nsf: number;
  wo: number;
  sync: number;
  updates: number;
  draws: number;
  calendar: number;
  seeded?: boolean;
  error?: string;
};

// Marks that draws are being tracked: until it's in the saved keys, the draws
// currently ready are recorded silently (no backlog alert when the alert is
// first switched on or deployed).
const DRAWS_TRACKING = "draws:tracking";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function runPushAlerts(deps: PushAlertDeps): Promise<PushAlertResult> {
  const [prev, payments, workOrders, syncs, assigned, drawCheck, due] = await Promise.all([
    deps.loadSentIds(),
    deps.returnedPayments(),
    deps.attentionWorkOrders(),
    deps.staleSyncs(),
    deps.assignedWorkOrderStages(),
    checkDraws(deps),
    deps.calendarDueToday().catch(() => [] as DueCalendarTask[]),
  ]);

  // Candidate event keys this run. Each detector contributes stable keys; the
  // set saved at the end is exactly these, so anything no longer current is
  // pruned (and will re-fire if the condition returns).
  const nsfItems = payments.map((p) => ({ key: `nsf:${p.id}`, p }));
  const woItems = workOrders.map((w) => ({ key: `wo:${w.number}`, w }));
  const syncItems = syncs.map((s) => ({ key: `sync:${s.id}`, s }));
  const stageItems = assigned.map((a) => ({ key: `wostage:${a.woId}:${a.stage}`, prefix: `wostage:${a.woId}:`, a }));
  // Draws: when they couldn't be read (or nobody wants the alert), carry the
  // previous draw keys over unchanged so nothing re-fires later.
  const { to: drawTo, draws } = drawCheck;
  const drawKeys =
    draws === null
      ? (prev ?? []).filter((k) => k === DRAWS_TRACKING || k.startsWith("draw:"))
      : [DRAWS_TRACKING, ...draws.map((d) => `draw:${d.id}`)];
  const calItems = due.map((d) => ({ key: `cal:${d.eventId}:${d.period}`, d }));
  const currentKeys = [
    ...nsfItems.map((i) => i.key),
    ...woItems.map((i) => i.key),
    ...syncItems.map((i) => i.key),
    ...stageItems.map((i) => i.key),
    ...drawKeys,
    ...calItems.map((i) => i.key),
  ];

  // First run (no state row): record everything currently in-window so only
  // *future* events notify — avoids blasting people with the backlog on deploy.
  if (prev === null) {
    await deps.saveSentIds(currentKeys);
    return { nsf: 0, wo: 0, sync: 0, updates: 0, draws: 0, calendar: 0, seeded: true };
  }

  const seen = new Set(prev);
  let nsf = 0;
  let wo = 0;
  let sync = 0;
  let updates = 0;
  let drawAlerts = 0;
  let calendar = 0;

  // --- payment_nsf (broadcast) ---
  const newNsf = nsfItems.filter((i) => !seen.has(i.key));
  if (newNsf.length) {
    const to = await deps.recipientsFor("payment_nsf");
    if (to.length) {
      for (const { key, p } of newNsf) {
        const who = p.tenant ? ` from ${p.tenant}` : "";
        const where = p.property ? ` at ${p.property}` : "";
        if (await sendSafe(deps, to, { title: "Payment returned (NSF)", body: `${money(p.amount)}${who}${where} was returned.`, url: "/accounting", tag: key })) nsf++;
      }
    }
  }

  // --- wo_new (broadcast) ---
  const newWo = woItems.filter((i) => !seen.has(i.key));
  if (newWo.length) {
    const to = await deps.recipientsFor("wo_new");
    if (to.length) {
      for (const { key, w } of newWo) {
        const where = w.property ? ` at ${w.property}` : "";
        const title = w.isHigh ? "Urgent work order" : "New work order";
        if (await sendSafe(deps, to, { title, body: `#${w.number} — ${w.issue}${where}${w.isHigh ? " (High priority)" : ""}.`, url: "/maintenance", tag: key })) wo++;
      }
    }
  }

  // --- sync_failure (broadcast) ---
  const newSync = syncItems.filter((i) => !seen.has(i.key));
  if (newSync.length) {
    const to = await deps.recipientsFor("sync_failure");
    if (to.length) {
      for (const { key, s } of newSync) {
        const since = s.lastRun ? ` since ${new Date(s.lastRun).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
        if (await sendSafe(deps, to, { title: "Sync problem", body: `${s.label} hasn't updated${since} (expected ${s.cadence.toLowerCase()}).`, url: "/admin/data", tag: key })) sync++;
      }
    }
  }

  // --- wo_assigned (personal): stage change on a WO you're the tech on ---
  const changed = stageItems.filter(
    // the WO was seen before at a *different* stage (not first observation, not unchanged)
    (i) => !seen.has(i.key) && [...seen].some((k) => k.startsWith(i.prefix))
  );
  if (changed.length) {
    const optedIn = new Set((await deps.recipientsFor("wo_assigned")).map((e) => e.toLowerCase()));
    for (const { key, a } of changed) {
      if (!optedIn.has(a.techEmail.toLowerCase())) continue;
      const label = a.number && a.number !== "—" ? `#${a.number}` : "A work order";
      if (await sendSafe(deps, [a.techEmail], { title: "Work order updated", body: `${label} — ${a.issue} moved to “${a.stage}”.`, url: "/maintenance", tag: key })) updates++;
    }
  }

  // --- batch_ready (broadcast): one summary of the new draws ready to batch ---
  if (draws && seen.has(DRAWS_TRACKING)) {
    const fresh = draws.filter((d) => !seen.has(`draw:${d.id}`));
    if (fresh.length && drawTo.length) {
      const sum = (xs: ReadyDraw[]) => Math.round(xs.reduce((s, d) => s + d.amount, 0) * 100) / 100;
      const n = fresh.length;
      const body =
        `${n} new payment${n === 1 ? "" : "s"} to PMI Lighthouse (${money(sum(fresh))}) ` +
        `— ${money(sum(draws))} ready to batch in total.`;
      if (await sendSafe(deps, drawTo, { title: "Draws ready to batch", body, url: "/accounting/rentvine", tag: "batch_ready" })) {
        drawAlerts++;
      }
    }
  }

  // --- calendar_tasks (personal): your task is due today ---
  const newCal = calItems.filter((i) => !seen.has(i.key));
  if (newCal.length) {
    const optedIn = new Set((await deps.recipientsFor("calendar_tasks")).map((e) => e.toLowerCase()));
    for (const { key, d } of newCal) {
      const owner = d.ownerEmail.toLowerCase();
      if (!optedIn.has(owner)) continue;
      const body = `${d.title} (${d.rule}) is due today.`;
      if (await sendSafe(deps, [owner], { title: `Due today: ${d.title}`, body, url: "/calendar", tag: key })) calendar++;
    }
  }

  await deps.saveSentIds(currentKeys);
  return { nsf, wo, sync, updates, draws: drawAlerts, calendar };
}

// Who wants batch_ready, and (only if anyone does) the draws ready right now —
// so Rentvine isn't queried every run for nobody.
async function checkDraws(deps: PushAlertDeps): Promise<{ to: string[]; draws: ReadyDraw[] | null }> {
  try {
    const to = await deps.recipientsFor("batch_ready");
    if (!to.length) return { to, draws: null };
    return { to, draws: await deps.readyDraws() };
  } catch {
    return { to: [], draws: null };
  }
}

async function sendSafe(deps: PushAlertDeps, to: string[], payload: PushPayload): Promise<boolean> {
  try {
    await deps.sendPush(to, payload);
    return true;
  } catch (e) {
    console.error(`[push-alerts] send failed (${payload.tag}):`, e);
    return false;
  }
}
