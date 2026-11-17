import { Prisma, type PrismaClient } from "@prisma/client";
import { CALENDAR_COLORS } from "@/lib/calendar/colors";

// Storage for calendar person colors (prisma/sql/calendar.sql): one row per
// person, and color is UNIQUE so two people can never share one. `auto` marks a
// color the app handed out (assignMissingColors) rather than one the person (or
// an admin) chose — an auto color can be moved to make room; a chosen one can't.
// Created on first use (db-change skill, Pattern B).

const DDL = [
  `CREATE TABLE IF NOT EXISTS calendar_user_colors (
     user_email TEXT PRIMARY KEY,
     color      TEXT NOT NULL UNIQUE,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE calendar_user_colors ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT false`,
];

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
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

// email (lower-case) → color hex.
export async function listUserColors(prisma: PrismaClient): Promise<Record<string, string>> {
  await ensureTable(prisma);
  const rows = await prisma.$queryRaw<{ user_email: string; color: string }[]>(
    Prisma.sql`SELECT user_email, color FROM calendar_user_colors`
  );
  return Object.fromEntries(rows.map((r) => [r.user_email, r.color]));
}

const isUniqueViolation = (e: unknown) => /23505|unique constraint/i.test(`${e instanceof Error ? e.message : ""} ${JSON.stringify(e)}`);

// Set a person's color (their own pick, or an admin's) — it becomes a chosen
// color (auto = false). If someone holds it only automatically, they're moved
// to the next free color first (`moved`); a chosen color can't be taken
// (takenBy: who has it; null if someone grabbed it at the same moment — the
// UNIQUE constraint stopped the second one).
export async function setUserColor(
  prisma: PrismaClient,
  email: string,
  color: string
): Promise<{ ok: true; moved?: { email: string; color: string } } | { ok: false; takenBy: string | null }> {
  await ensureTable(prisma);
  const me = email.trim().toLowerCase();
  const [holder] = await prisma.$queryRaw<{ user_email: string; auto: boolean | null }[]>(
    Prisma.sql`SELECT user_email, auto FROM calendar_user_colors WHERE color = ${color} AND user_email <> ${me}`
  );
  let moved: { email: string; color: string } | undefined;
  if (holder) {
    if (!holder.auto) return { ok: false, takenBy: holder.user_email };
    const rows = await prisma.$queryRaw<{ color: string }[]>(Prisma.sql`SELECT color FROM calendar_user_colors`);
    const used = new Set([...rows.map((r) => r.color.toLowerCase()), color.toLowerCase()]);
    const next = CALENDAR_COLORS.find((c) => !used.has(c.hex.toLowerCase()));
    if (!next) return { ok: false, takenBy: holder.user_email };
    // Only if it's still automatic — they may have just picked it themselves.
    const upd = await prisma.$queryRaw<{ user_email: string }[]>(Prisma.sql`
      UPDATE calendar_user_colors SET color = ${next.hex}, updated_at = now()
      WHERE user_email = ${holder.user_email} AND auto RETURNING user_email`);
    if (!upd.length) return { ok: false, takenBy: holder.user_email };
    moved = { email: holder.user_email, color: next.hex };
  }
  try {
    await prisma.$queryRaw(Prisma.sql`
      INSERT INTO calendar_user_colors (user_email, color, auto) VALUES (${me}, ${color}, false)
      ON CONFLICT (user_email) DO UPDATE SET color = EXCLUDED.color, auto = false, updated_at = now()
      RETURNING user_email`);
    return moved ? { ok: true, moved } : { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, takenBy: null };
    throw e;
  }
}

// Give everyone in `emails` (in priority order) who has no color the next free
// one, until the colors run out — the rest stay grey. Marked auto, so they can
// change it (and an admin can move it). Returns everyone's colors afterwards.
export async function assignMissingColors(prisma: PrismaClient, emails: string[]): Promise<Record<string, string>> {
  await ensureTable(prisma);
  const rows = await prisma.$queryRaw<{ user_email: string; color: string }[]>(
    Prisma.sql`SELECT user_email, color FROM calendar_user_colors`
  );
  const colors: Record<string, string> = Object.fromEntries(rows.map((r) => [r.user_email, r.color]));
  const used = new Set(rows.map((r) => r.color.toLowerCase()));
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].filter((e) => !colors[e]);
  for (const email of wanted) {
    for (const c of CALENDAR_COLORS) {
      if (used.has(c.hex.toLowerCase())) continue;
      used.add(c.hex.toLowerCase());
      // DO NOTHING covers both "they got one meanwhile" and "someone took this color".
      const ins = await prisma.$queryRaw<{ user_email: string }[]>(Prisma.sql`
        INSERT INTO calendar_user_colors (user_email, color, auto) VALUES (${email}, ${c.hex}, true)
        ON CONFLICT DO NOTHING RETURNING user_email`);
      if (ins.length) {
        colors[email] = c.hex;
        break;
      }
    }
  }
  return colors;
}
