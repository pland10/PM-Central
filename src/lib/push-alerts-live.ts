import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailsForCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser, type PushPayload } from "@/lib/push-send";
import { attentionList, workOrderAlerts } from "@/lib/work-orders-dashboard";
import type { AttentionWorkOrder, PushAlertDeps, ReturnedPayment } from "@/lib/push-alerts";

// Real dependencies for runPushAlerts: Neon for the returned payments, new/urgent
// work orders (reusing the dashboard's attention logic) and the sent-key
// watermark (push_alert_state), plus Web Push for delivery. The watermark table
// is created on first use.

const RETURNED_WINDOW_DAYS = 7; // how far back a returned payment can still alert
const WO_WINDOW_HOURS = 72; // "new" work-order window (matches the dashboard)

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
