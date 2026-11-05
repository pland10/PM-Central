import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchWithRetry } from "@/lib/http-retry";
import { sendEmail } from "@/lib/email";
import type { LsText, TextAlertDeps } from "@/lib/text-alerts";

// Real dependencies for runTextAlerts: LeadSimple's /text_messages, Neon for
// the watermark (text_notify_state, shared with the old Python notifier) and
// the phone book (synced activities), Resend for the email.
//
// Env: LEADSIMPLE_API_KEY (or LS_API_KEY), TEXT_NOTIFY_TO (comma-separated),
// RESEND_API_KEY; optional TEXT_ALERT_FROM.

const LS_BASE = "https://api.leadsimple.com/rest";
const DEFAULT_FROM = "PMI Lighthouse <notifications@pmilighthouse.app>";

export function textAlertConfig() {
  return {
    apiKey: process.env.LEADSIMPLE_API_KEY || process.env.LS_API_KEY || "",
    recipients: (process.env.TEXT_NOTIFY_TO || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

let table: Promise<void> | null = null;
function ensureStateTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS text_notify_state (
           id int PRIMARY KEY, since text, sent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
           updated_at timestamptz NOT NULL DEFAULT now())`
      )
      .then(() => undefined)
      .catch((e) => {
        table = null;
        throw e;
      });
  }
  return table;
}

export function liveTextAlertDeps(): TextAlertDeps {
  const { apiKey, recipients } = textAlertConfig();
  return {
    recipients,
    async loadState() {
      await ensureStateTable();
      const rows = await prisma.$queryRaw<{ since: string | null; sent_ids: string[] | null }[]>(
        Prisma.sql`SELECT since, sent_ids FROM text_notify_state WHERE id = 1`
      );
      return { since: rows[0]?.since ?? null, sentIds: rows[0]?.sent_ids ?? [] };
    },
    async saveState(since, sentIds) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO text_notify_state (id, since, sent_ids, updated_at)
        VALUES (1, ${since}, ${JSON.stringify(sentIds)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE
          SET since = EXCLUDED.since, sent_ids = EXCLUDED.sent_ids, updated_at = now()`);
    },
    async fetchPage(page) {
      const res = await fetchWithRetry(`${LS_BASE}/text_messages?per_page=200&page=${page}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`LeadSimple /text_messages HTTP ${res.status}`);
      const json = (await res.json()) as { data?: LsText[] };
      return (json.data ?? []).map((m) => ({ ...m, id: String(m.id) }));
    },
    async phoneRows() {
      return prisma.$queryRaw<{ deal_name: string; contact_phones: string }[]>(Prisma.sql`
        SELECT DISTINCT deal_name, contact_phones FROM activities
        WHERE coalesce(contact_phones, '') <> '' AND coalesce(deal_name, '') <> ''`);
    },
    async send(alert) {
      const r = await sendEmail({
        to: recipients,
        subject: alert.subject,
        html: alert.html,
        from: process.env.TEXT_ALERT_FROM || DEFAULT_FROM,
      });
      if (!r.ok) console.warn(`[text-alerts] send failed: ${r.error}`);
      return r.ok;
    },
    async heartbeat(detail) {
      await prisma
        .$executeRaw(Prisma.sql`
          INSERT INTO sync_status (job, last_run_at, detail) VALUES ('text_alerts', now(), ${detail})
          ON CONFLICT (job) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`)
        .catch(() => undefined);
    },
  };
}
