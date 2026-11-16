import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DATA_SOURCES } from "@/config/data-sources";
import { emailsForCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser, type PushPayload } from "@/lib/push-send";
import { getSyncStatusMap } from "@/lib/sync-status";
import { attentionList, workOrderAlerts } from "@/lib/work-orders-dashboard";
import type { AssignedWorkOrder, AttentionWorkOrder, PushAlertDeps, ReturnedPayment, StaleSync } from "@/lib/push-alerts";

// Real dependencies for runPushAlerts: Neon for the returned payments, new/urgent
// work orders (reusing the dashboard's attention logic), stale syncs, assigned
// work orders and the sent-key watermark (push_alert_state), plus Web Push for
// delivery. The watermark table is created on first use.

const RETURNED_WINDOW_DAYS = 7; // how far back a returned payment can still alert
const WO_WINDOW_HOURS = 72; // "new" work-order window (matches the dashboard)
const STALE_HOURLY_H = 6; // an hourly-tier sync is "stale" after this many hours
const STALE_DAILY_H = 30; // a daily-tier sync is "stale" after this many hours (matches the health check)

let table: Promise<void> | null = null;
function ensureStateTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS push_alert_state (
           id int PRIMARY KEY,
           sent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`
      )
      .then(() => undefined)
      .catch((e) => {
        table = null;
        throw e;
      });
  }
  return table;
}

export function livePushAlertDeps(): PushAlertDeps {
  return {
    async loadSentIds() {
      await ensureStateTable();
      const rows = await prisma.$queryRaw<{ sent_ids: string[] | null }[]>(
        Prisma.sql`SELECT sent_ids FROM push_alert_state WHERE id = 1`
      );
      // No row yet => first run ever (the runner seeds silently).
      return rows.length ? rows[0].sent_ids ?? [] : null;
    },

    async saveSentIds(ids: string[]) {
      await ensureStateTable();
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO push_alert_state (id, sent_ids, updated_at)
        VALUES (1, ${JSON.stringify(ids)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET sent_ids = EXCLUDED.sent_ids, updated_at = now()`);
    },

    async returnedPayments(): Promise<ReturnedPayment[]> {
      try {
        const rows = await prisma.$queryRaw<{ id: string; tenant: string | null; property: string | null; amount: number }[]>(
          Prisma.sql`
            SELECT source_id AS id, tenant, property_address AS property, amount::float8 AS amount
            FROM payments
            WHERE status = 'returned'
              AND date_posted >= (now() - make_interval(days => ${RETURNED_WINDOW_DAYS}))::date`
        );
        return rows.map((r) => ({ id: r.id, tenant: r.tenant, property: r.property, amount: Number(r.amount) }));
      } catch {
        return []; // payments table not present yet — nothing to alert
      }
    },

    async attentionWorkOrders(): Promise<AttentionWorkOrder[]> {
      const items = attentionList(await workOrderAlerts(WO_WINDOW_HOURS));
      return items
        .filter((w) => w.number && w.number !== "—")
        .map((w) => ({
          number: w.number,
          issue: w.issue || "Work order",
          property: w.property || "",
          priority: w.priority,
          link: w.link,
          isNew: w.isNew,
          isHigh: w.isHigh,
        }));
    },

    async staleSyncs(): Promise<StaleSync[]> {
      try {
        const map = await getSyncStatusMap();
        const now = Date.now();
        const out: StaleSync[] = [];
        for (const s of DATA_SOURCES) {
          if (s.comingSoon) continue;
          // Freshness = the OLDEST of the source's jobs that have a heartbeat.
          // No heartbeat at all => never ran / not configured => skip (we can't
          // tell "broken" from "not set up yet").
          const runs = s.jobs.map((j) => map[j]?.last_run_at ?? null).filter((d): d is Date => d != null);
          if (!runs.length) continue;
          const oldest = runs.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
          const limitH = s.tier === "daily" ? STALE_DAILY_H : STALE_HOURLY_H;
          if (now - oldest.getTime() > limitH * 3_600_000) {
            out.push({ id: s.id, label: s.label, cadence: s.cadence, lastRun: oldest.toISOString() });
          }
        }
        return out;
      } catch {
        return []; // sync_status not reachable — don't invent failures
      }
    },

    async assignedWorkOrderStages(): Promise<AssignedWorkOrder[]> {
      try {
        const rows = await prisma.$queryRaw<
          { wo_id: string; wo_number: string | null; stage: string | null; title: string | null; name: string | null; tech_email: string }[]
        >(Prisma.sql`
          SELECT t.wo_id, w.wo_number, w.stage, w.title, w.name, t.tech_email
          FROM work_order_techs t
          JOIN work_orders w ON w.source_id = t.wo_id`);
        return rows.map((r) => ({
          woId: r.wo_id,
          number: r.wo_number ?? "—",
          stage: r.stage ?? "—",
          issue: r.title || r.name || "Work order",
          techEmail: r.tech_email,
        }));
      } catch {
        return []; // one of the tables isn't present yet
      }
    },

    recipientsFor(category: string) {
      return emailsForCategory(category);
    },

    async sendPush(emails: string[], payload: PushPayload) {
      let sent = 0;
      await Promise.all(
        emails.map(async (email) => {
          const r = await sendPushToUser(null, email, payload);
          sent += r.sent;
        })
      );
      return { sent };
    },
  };
}
