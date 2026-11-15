import type { PushPayload } from "@/lib/push-send";

// Phase 3 admin broadcast triggers. A cron scans for new returned/NSF payments
// and new/urgent work orders, and pushes each to everyone who opted into the
// matching admin category. A watermark of already-sent event keys (push-alerts-
// live.ts) dedups across runs; the key set is pruned to what's still in-window
// each run, so it stays bounded. See src/app/api/cron/push-alerts/route.ts.

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

export type PushAlertDeps = {
  // null = no state row yet (first run ever) — seed silently, don't backfill.
  loadSentIds(): Promise<string[] | null>;
  saveSentIds(ids: string[]): Promise<void>;
  returnedPayments(): Promise<ReturnedPayment[]>;
  attentionWorkOrders(): Promise<AttentionWorkOrder[]>;
  recipientsFor(category: string): Promise<string[]>;
  sendPush(emails: string[], payload: PushPayload): Promise<{ sent: number }>;
};

export type PushAlertResult = { nsf: number; wo: number; seeded?: boolean; error?: string };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function runPushAlerts(deps: PushAlertDeps): Promise<PushAlertResult> {
  const [prev, payments, workOrders] = await Promise.all([
    deps.loadSentIds(),
    deps.returnedPayments(),
    deps.attentionWorkOrders(),
  ]);

  // Candidate events this run, each with a stable dedup key.
  const nsfItems = payments.map((p) => ({ key: `nsf:${p.id}`, p }));
  const woItems = workOrders.map((w) => ({ key: `wo:${w.number}`, w }));
  const currentKeys = [...nsfItems.map((i) => i.key), ...woItems.map((i) => i.key)];

  // First run (no state row): record everything currently in-window so only
  // *future* events notify — avoids blasting admins with the backlog on deploy.
  if (prev === null) {
    await deps.saveSentIds(currentKeys);
    return { nsf: 0, wo: 0, seeded: true };
  }

  const seen = new Set(prev);
  const newNsf = nsfItems.filter((i) => !seen.has(i.key));
  const newWo = woItems.filter((i) => !seen.has(i.key));

  let nsf = 0;
  let wo = 0;

  if (newNsf.length) {
    const to = await deps.recipientsFor("payment_nsf");
    if (to.length) {
      for (const { key, p } of newNsf) {
        const who = p.tenant ? ` from ${p.tenant}` : "";
        const where = p.property ? ` at ${p.property}` : "";
        const ok = await sendSafe(deps, to, {
          title: "Payment returned (NSF)",
          body: `${money(p.amount)}${who}${where} was returned.`,
          url: "/accounting",
          tag: key,
        });
        if (ok) nsf++;
      }
    }
  }

  if (newWo.length) {
    const to = await deps.recipientsFor("wo_new");
    if (to.length) {
      for (const { key, w } of newWo) {
        const where = w.property ? ` at ${w.property}` : "";
        const ok = await sendSafe(deps, to, {
          title: w.isHigh ? "Urgent work order" : "New work order",
          body: `#${w.number} — ${w.issue}${where}${w.isHigh ? " (High priority)" : ""}.`,
          url: "/maintenance",
          tag: key,
        });
        if (ok) wo++;
      }
    }
  }

  // Prune to the current window so the key set stays bounded.
  await deps.saveSentIds(currentKeys);
  return { nsf, wo };
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
