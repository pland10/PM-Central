import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { DEFAULT_TEMPLATE, type ReminderRecipient, type ReminderTemplate } from "@/lib/reminders";

// Storage for rent-reminder emails: the single editable template, and a log of
// who was reminded and when (so the dashboard can show "Reminded Nov 3" and we
// don't double-send). Raw SQL + ensure-guard, created on first use; documented
// in prisma/sql/reminders.sql.

const DDL = [
  `CREATE TABLE IF NOT EXISTS reminder_template (
     id          INT PRIMARY KEY DEFAULT 1,
     subject     TEXT NOT NULL,
     body        TEXT NOT NULL,
     updated_at  TIMESTAMPTZ DEFAULT now(),
     updated_by  TEXT,
     CONSTRAINT reminder_template_single CHECK (id = 1)
   )`,
  `CREATE TABLE IF NOT EXISTS reminder_log (
     id         SERIAL PRIMARY KEY,
     lease_id   TEXT NOT NULL,
     tenant     TEXT,
     email      TEXT,
     amount     NUMERIC,
     sent_by    TEXT,
     sent_at    TIMESTAMPTZ DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS reminder_log_lease_idx ON reminder_log (lease_id, sent_at DESC)`,
];

let tables: Promise<void> | null = null;
export function ensureRemindersTables(): Promise<void> {
  if (!tables) {
    tables = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      tables = null; // let a later call retry
      throw e;
    });
  }
  return tables;
}

export async function getReminderTemplate(): Promise<ReminderTemplate> {
  await ensureRemindersTables();
  const rows = await prisma.$queryRaw<{ subject: string; body: string }[]>(
    Prisma.sql`SELECT subject, body FROM reminder_template WHERE id = 1`
  );
  return rows.length ? { subject: rows[0].subject, body: rows[0].body } : DEFAULT_TEMPLATE;
}

export async function saveReminderTemplate(tpl: ReminderTemplate, by: string): Promise<void> {
  await ensureRemindersTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO reminder_template (id, subject, body, updated_at, updated_by)
    VALUES (1, ${tpl.subject}, ${tpl.body}, now(), ${by})
    ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = now(), updated_by = EXCLUDED.updated_by`);
}

export async function recordReminders(
  entries: { leaseId: string; tenant: string; email: string; amount: number }[],
  by: string
): Promise<void> {
  if (entries.length === 0) return;
  await ensureRemindersTables();
  for (const e of entries) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO reminder_log (lease_id, tenant, email, amount, sent_by)
      VALUES (${e.leaseId}, ${e.tenant}, ${e.email}, ${e.amount}, ${by})`);
  }
}

// Latest reminder per lease, for the "Reminded <date>" hint on the panel.
export async function lastRemindedByLease(): Promise<Record<string, string>> {
  try {
    await ensureRemindersTables();
    const rows = await prisma.$queryRaw<{ lease_id: string; sent_at: Date }[]>(Prisma.sql`
      SELECT DISTINCT ON (lease_id) lease_id, sent_at
      FROM reminder_log ORDER BY lease_id, sent_at DESC`);
    return Object.fromEntries(rows.map((r) => [r.lease_id, new Date(r.sent_at).toISOString()]));
  } catch {
    return {};
  }
}

const nameOf = (c: { firstName: string | null; lastName: string | null; companyName: string | null } | undefined): string =>
  !c ? "Resident" : c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Resident";

// Re-derive recipients from the DB by lease id — never trust the client's idea
// of who owes what or which address to email. Only active leases with a real
// balance and an email on file can be reminded.
export async function fetchRecipients(leaseIds: string[]): Promise<ReminderRecipient[]> {
  if (leaseIds.length === 0) return [];
  const leases = await prisma.lease.findMany({
    where: { id: { in: leaseIds }, status: "active" },
    include: { tenants: { include: { contact: true } }, unit: { include: { property: true } } },
  });
  const out: ReminderRecipient[] = [];
  for (const l of leases) {
    if (l.balanceDue <= 0) continue;
    const contact = l.tenants[0]?.contact;
    const email = contact?.email?.trim();
    if (!email) continue;
    out.push({
      leaseId: l.id,
      tenant: nameOf(contact ?? undefined),
      property: l.unit?.property ? formatAddress(l.unit.property) : "your unit",
      email,
      amount: l.balanceDue,
    });
  }
  return out;
}
