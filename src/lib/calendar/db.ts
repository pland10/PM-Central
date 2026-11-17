import { Prisma, type PrismaClient } from "@prisma/client";
import { STARTER_EVENTS, type CalendarEvent, type CalendarEventInput, type TaskStatus } from "@/lib/calendar/events";
import type { Adjust, Frequency } from "@/lib/calendar/rules";

// Storage for the close calendar (prisma/sql/calendar.sql). App-owned raw tables,
// created on first use (db-change skill, Pattern B):
//   calendar_events       — the recurring events (rule, frequency, owner)
//   calendar_task_status  — one row per event per month that's been checked off
//   calendar_settings     — single row; `seeded` makes the starter set load once

const DDL = [
  `CREATE TABLE IF NOT EXISTS calendar_events (
     id          SERIAL PRIMARY KEY,
     title       TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     rule        TEXT NOT NULL,
     frequency   TEXT NOT NULL DEFAULT 'monthly',
     month       INT,
     adjust      TEXT NOT NULL DEFAULT 'prior',
     owner_email TEXT,
     owner_name  TEXT,
     active      BOOLEAN NOT NULL DEFAULT true,
     created_by  TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS calendar_task_status (
     event_id     INT NOT NULL,
     period       TEXT NOT NULL,
     done_by      TEXT,
     done_by_name TEXT,
     done_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (event_id, period)
   )`,
  `CREATE TABLE IF NOT EXISTS calendar_settings (
     id     INT PRIMARY KEY DEFAULT 1,
     seeded BOOLEAN NOT NULL DEFAULT false,
     CONSTRAINT calendar_settings_single CHECK (id = 1)
   )`,
  `INSERT INTO calendar_settings (id, seeded) VALUES (1, false) ON CONFLICT (id) DO NOTHING`,
  // Daily summary email: who gets it, and the last day it went out (sent once a day).
  `ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS digest_to TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS digest_last_sent DATE`,
];

let ready: Promise<void> | null = null;
function ensureTables(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

// Load the starter set the first time only — one statement, so it can't run
// twice or half-way, and deleting every event later doesn't bring them back.
async function seedOnce(prisma: PrismaClient): Promise<void> {
  const rows = STARTER_EVENTS.map(
    (e) => Prisma.sql`(${e.title}, ${e.description}, ${e.rule}, ${e.frequency}, ${e.month}::int, ${e.adjust}, 'starter set')`
  );
  await prisma.$executeRaw(Prisma.sql`
    WITH s AS (UPDATE calendar_settings SET seeded = true WHERE id = 1 AND NOT seeded RETURNING id)
    INSERT INTO calendar_events (title, description, rule, frequency, month, adjust, created_by)
    SELECT v.* FROM (VALUES ${Prisma.join(rows)}) AS v(title, description, rule, frequency, month, adjust, created_by)
    WHERE EXISTS (SELECT 1 FROM s)`);
}

type Row = {
  id: number;
  title: string;
  description: string | null;
  rule: string;
  frequency: string;
  month: number | null;
  adjust: string;
  owner_email: string | null;
  owner_name: string | null;
  active: boolean;
};
const COLS = Prisma.sql`id, title, description, rule, frequency, month, adjust, owner_email, owner_name, active`;

const toEvent = (r: Row): CalendarEvent => ({
  id: r.id,
  title: r.title,
  description: r.description ?? "",
  rule: r.rule,
  frequency: r.frequency as Frequency,
  month: r.month,
  adjust: r.adjust as Adjust,
  ownerEmail: r.owner_email,
  ownerName: r.owner_name,
  active: r.active,
});

export async function listCalendarEvents(prisma: PrismaClient): Promise<CalendarEvent[]> {
  await ensureTables(prisma);
  await seedOnce(prisma);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${COLS} FROM calendar_events ORDER BY id`);
  return rows.map(toEvent);
}

type Save = CalendarEventInput & { ownerName: string | null };

export async function createCalendarEvent(prisma: PrismaClient, e: Save, by: string): Promise<CalendarEvent> {
  await ensureTables(prisma);
  const [row] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    INSERT INTO calendar_events (title, description, rule, frequency, month, adjust, owner_email, owner_name, created_by)
    VALUES (${e.title}, ${e.description}, ${e.rule}, ${e.frequency}, ${e.month}, ${e.adjust}, ${e.ownerEmail}, ${e.ownerName}, ${by})
    RETURNING ${COLS}`);
  return toEvent(row);
}

export async function updateCalendarEvent(prisma: PrismaClient, id: number, e: Save): Promise<CalendarEvent | null> {
  await ensureTables(prisma);
  const [row] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    UPDATE calendar_events
       SET title = ${e.title}, description = ${e.description}, rule = ${e.rule}, frequency = ${e.frequency},
           month = ${e.month}, adjust = ${e.adjust}, owner_email = ${e.ownerEmail}, owner_name = ${e.ownerName},
           updated_at = now()
     WHERE id = ${id}
    RETURNING ${COLS}`);
  return row ? toEvent(row) : null;
}

export async function deleteCalendarEvent(prisma: PrismaClient, id: number): Promise<boolean> {
  await ensureTables(prisma);
  const [, n] = await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM calendar_task_status WHERE event_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM calendar_events WHERE id = ${id}`),
  ]);
  return Number(n) > 0;
}

export type { TaskStatus };
type StatusRow = { event_id?: number; period?: string; done_by: string | null; done_by_name: string | null; done_at: Date };
const toStatus = (r: StatusRow): TaskStatus => ({
  doneBy: r.done_by ?? "",
  doneByName: r.done_by_name ?? r.done_by ?? "",
  doneAt: new Date(r.done_at).toISOString(),
});

// Check-offs in these months ("YYYY-MM") — monthly ones and the days of daily
// ones ("YYYY-MM-DD") — keyed "<eventId>:<period>".
export async function listTaskStatuses(prisma: PrismaClient, periods: string[]): Promise<Record<string, TaskStatus>> {
  if (periods.length === 0) return {};
  await ensureTables(prisma);
  const rows = await prisma.$queryRaw<StatusRow[]>(Prisma.sql`
    SELECT event_id, period, done_by, done_by_name, done_at FROM calendar_task_status
    WHERE left(period, 7) IN (${Prisma.join(periods)})`);
  return Object.fromEntries(rows.map((r) => [`${r.event_id}:${r.period}`, toStatus(r)]));
}

// Check off (or un-check) one event's task for a month. ok: false = no such event.
export async function setTaskStatus(
  prisma: PrismaClient,
  eventId: number,
  period: string,
  done: boolean,
  by: string,
  byName: string
): Promise<{ ok: true; status: TaskStatus | null } | { ok: false }> {
  await ensureTables(prisma);
  if (!done) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM calendar_task_status WHERE event_id = ${eventId} AND period = ${period}`);
    return { ok: true, status: null };
  }
  const rows = await prisma.$queryRaw<StatusRow[]>(Prisma.sql`
    INSERT INTO calendar_task_status (event_id, period, done_by, done_by_name)
    SELECT ${eventId}, ${period}, ${by}, ${byName}
    WHERE EXISTS (SELECT 1 FROM calendar_events WHERE id = ${eventId})
    ON CONFLICT (event_id, period) DO UPDATE SET done_by = EXCLUDED.done_by, done_by_name = EXCLUDED.done_by_name, done_at = now()
    RETURNING done_by, done_by_name, done_at`);
  return rows[0] ? { ok: true, status: toStatus(rows[0]) } : { ok: false };
}

// --- Daily summary email settings -------------------------------------------

export async function getDigestRecipients(prisma: PrismaClient): Promise<string[]> {
  await ensureTables(prisma);
  const [row] = await prisma.$queryRaw<{ digest_to: string | null }[]>(
    Prisma.sql`SELECT digest_to FROM calendar_settings WHERE id = 1`
  );
  return (row?.digest_to ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

export async function setDigestRecipients(prisma: PrismaClient, emails: string[]): Promise<void> {
  await ensureTables(prisma);
  await prisma.$executeRaw(Prisma.sql`UPDATE calendar_settings SET digest_to = ${emails.join(",")} WHERE id = 1`);
}

// Claim today's send (YYYY-MM-DD): true for the one caller that gets it, so the
// email goes out once a day however many times the cron fires.
export async function claimDigestSend(prisma: PrismaClient, date: string): Promise<boolean> {
  await ensureTables(prisma);
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    UPDATE calendar_settings SET digest_last_sent = ${date}::date
    WHERE id = 1 AND (digest_last_sent IS NULL OR digest_last_sent < ${date}::date)
    RETURNING id`);
  return rows.length > 0;
}

// Undo a claim after a failed send, so a later run can try again.
export async function releaseDigestSend(prisma: PrismaClient, date: string): Promise<void> {
  await ensureTables(prisma);
  await prisma.$executeRaw(Prisma.sql`UPDATE calendar_settings SET digest_last_sent = NULL WHERE id = 1 AND digest_last_sent = ${date}::date`);
}
