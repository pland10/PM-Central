import { Prisma, type PrismaClient } from "@prisma/client";

// Storage for calendar person colors (prisma/sql/calendar.sql): one row per
// person, and color is UNIQUE so two people can never share one. Created on
// first use (db-change skill, Pattern B).

const DDL = `CREATE TABLE IF NOT EXISTS calendar_user_colors (
  user_email TEXT PRIMARY KEY,
  color      TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = prisma
      .$executeRawUnsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
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

// Set a person's own color. takenBy: who has it (null if someone grabbed it at
// the same moment — the UNIQUE constraint stopped the second one).
export async function setUserColor(
  prisma: PrismaClient,
  email: string,
  color: string
): Promise<{ ok: true } | { ok: false; takenBy: string | null }> {
  await ensureTable(prisma);
  const me = email.trim().toLowerCase();
  const [holder] = await prisma.$queryRaw<{ user_email: string }[]>(
    Prisma.sql`SELECT user_email FROM calendar_user_colors WHERE color = ${color} AND user_email <> ${me}`
  );
  if (holder) return { ok: false, takenBy: holder.user_email };
  try {
    await prisma.$queryRaw(Prisma.sql`
      INSERT INTO calendar_user_colors (user_email, color) VALUES (${me}, ${color})
      ON CONFLICT (user_email) DO UPDATE SET color = EXCLUDED.color, updated_at = now()
      RETURNING user_email`);
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, takenBy: null };
    throw e;
  }
}
