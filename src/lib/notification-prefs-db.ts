import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Per-user notification category preferences (see prisma/sql/push.sql). Table is
// created on first use. Absent row = off.

let table: Promise<void> | null = null;
export function ensureNotificationPrefsTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS notification_prefs (
           user_email TEXT NOT NULL,
           category   TEXT NOT NULL,
           enabled    BOOLEAN NOT NULL DEFAULT false,
           updated_at TIMESTAMPTZ DEFAULT now(),
           PRIMARY KEY (user_email, category)
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

// The category keys a user has turned on.
export async function getEnabledCategories(userEmail: string): Promise<string[]> {
  await ensureNotificationPrefsTable();
  const rows = await prisma.$queryRaw<{ category: string }[]>(
    Prisma.sql`SELECT category FROM notification_prefs WHERE user_email = ${userEmail} AND enabled = true`
  );
  return rows.map((r) => r.category);
}

export async function setCategory(userEmail: string, category: string, enabled: boolean): Promise<void> {
  await ensureNotificationPrefsTable();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO notification_prefs (user_email, category, enabled, updated_at)
    VALUES (${userEmail}, ${category}, ${enabled}, now())
    ON CONFLICT (user_email, category) DO UPDATE SET enabled = ${enabled}, updated_at = now()`);
}

// Emails of everyone who opted into a category — for broadcast (admin) events.
export async function emailsForCategory(category: string): Promise<string[]> {
  await ensureNotificationPrefsTable();
  const rows = await prisma.$queryRaw<{ user_email: string }[]>(
    Prisma.sql`SELECT user_email FROM notification_prefs WHERE category = ${category} AND enabled = true`
  );
  return rows.map((r) => r.user_email);
}

// Whether one user has a category on — for personal events (e.g. the assignee).
export async function hasCategory(userEmail: string, category: string): Promise<boolean> {
  await ensureNotificationPrefsTable();
  const rows = await prisma.$queryRaw<{ one: number }[]>(
    Prisma.sql`SELECT 1 AS one FROM notification_prefs WHERE user_email = ${userEmail} AND category = ${category} AND enabled = true LIMIT 1`
  );
  return rows.length > 0;
}
