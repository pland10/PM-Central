import type { PushPayload } from "@/lib/push-send";

// Phase 3 scheduled notification triggers, run by the push-alerts cron:
//  - payment_nsf (admin broadcast): new returned/NSF payments
//  - wo_new      (admin broadcast): new / urgent work orders
//  - sync_failure(admin broadcast): a sync that has gone stale
//  - wo_assigned (personal): the stage of a work order you're the tech on changed
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

export type PushAlertDeps = {
  // null = no state row yet (first run ever) — seed silently, don't backfill.
  loadSentIds(): Promise<string[] | null>;
  saveSentIds(ids: string[]): Promise<void>;
  returnedPayments(): Promise<ReturnedPayment[]>;
  attentionWorkOrders(): Promise<AttentionWorkOrder[]>;
  staleSyncs(): Promise<StaleSync[]>;
  assignedWorkOrderStages(): Promise<AssignedWorkOrder[]>;
  recipientsFor(category: string): Promise<string[]>;
  sendPush(emails: string[], payload: PushPayload): Promise<{ sent: number }>;
};

export type PushAlertResult = { nsf: number; wo: number; sync: number; updates: number; seeded?: boolean; error?: string };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function runPushAlerts(deps: PushAlertDeps): Promise<PushAlertResult> {
  const [prev, payments, workOrders, syncs, assigned] = await Promise.all([
    deps.loadSentIds(),
    deps.returnedPayments(),
    deps.attentionWorkOrders(),
    deps.staleSyncs(),
    deps.assignedWorkOrderStages(),
  ]);

  // Candidate event keys this run. Each detector contributes stable keys; the
  // set saved at the end is exactly these, so anything no longer current is
  // pruned (and will re-fire if the condition returns).
  const nsfItems = payments.map((p) => ({ key: `nsf:${p.id}`, p }));
  const woItems = workOrders.map((w) => ({ key: `wo:${w.number}`, w }));
  const syncItems = syncs.map((s) => ({ key: `sync:${s.id}`, s }));
  const stageItems = assigned.map((a) => ({ key: `wostage:${a.woId}:${a.stage}`, prefix: `wostage:${a.woId}:`, a }));
  const currentKeys = [
    ...nsfItems.map((i) => i.key),
    ...woItems.map((i) => i.key),
    ...syncItems.map((i) => i.key),
    ...stageItems.map((i) => i.key),
  ];

  // First run (no state row): record everything currently in-window so only
  // *future* events notify — avoids blasting people with the backlog on deploy.
  if (prev === null) {
    await deps.saveSentIds(currentKeys);
    return { nsf: 0, wo: 0, sync: 0, updates: 0, seeded: true };
  }

  const seen = new Set(prev);
  let nsf = 0;
  let wo = 0;
  let sync = 0;
  let updates = 0;

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

  await deps.saveSentIds(currentKeys);
  return { nsf, wo, sync, updates };
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
