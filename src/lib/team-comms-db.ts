import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Data layer for the Team Comms "Capture settings" page — the opt-in controls
// for which RingCentral chats get captured per person. Reads/writes the
// rc_available_chats / rc_capture_prefs / rc_user_links tables on Neon (see
// prisma/sql/rc_capture.sql). Server-only.

export type CaptureChat = {
  chatId: string;
  chatName: string;
  chatType: string | null;
  include: boolean;
};

export type Person = { personId: string; personName: string | null };

// Self-create the tables on first use so the page works even before the SQL is
// applied by hand. Idempotent + additive — matches rc_chat_sync.py's DDL.
export async function ensureCaptureTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rc_available_chats (
      person_id text NOT NULL, person_name text, chat_id text NOT NULL,
      chat_name text, chat_type text, updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (person_id, chat_id))`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rc_capture_prefs (
      person_id text NOT NULL, chat_id text NOT NULL,
      include boolean NOT NULL DEFAULT false, updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (person_id, chat_id))`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rc_user_links (
      pmc_email text PRIMARY KEY, person_id text NOT NULL,
      updated_at timestamptz DEFAULT now())`);
}

export async function listPeople(): Promise<Person[]> {
  const rows = await prisma.$queryRaw<{ person_id: string; person_name: string | null }[]>(
    Prisma.sql`SELECT person_id, MAX(person_name) AS person_name
               FROM rc_available_chats
               GROUP BY person_id
               ORDER BY MAX(person_name) NULLS LAST`
  );
  return rows.map((r) => ({ personId: r.person_id, personName: r.person_name }));
}

export async function linkedPersonFor(email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ person_id: string }[]>(
    Prisma.sql`SELECT person_id FROM rc_user_links WHERE pmc_email = ${email} LIMIT 1`
  );
  return rows[0]?.person_id ?? null;
}

export async function linkUser(email: string, personId: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO rc_user_links (pmc_email, person_id, updated_at)
               VALUES (${email}, ${personId}, now())
               ON CONFLICT (pmc_email) DO UPDATE
               SET person_id = EXCLUDED.person_id, updated_at = now()`
  );
}

export async function chatsForPerson(personId: string): Promise<CaptureChat[]> {
  const rows = await prisma.$queryRaw<
    { chat_id: string; chat_name: string | null; chat_type: string | null; include: boolean | null }[]
  >(
    Prisma.sql`SELECT a.chat_id, a.chat_name, a.chat_type, COALESCE(p.include, false) AS include
               FROM rc_available_chats a
               LEFT JOIN rc_capture_prefs p
                 ON p.person_id = a.person_id AND p.chat_id = a.chat_id
               WHERE a.person_id = ${personId}
               ORDER BY a.chat_name NULLS LAST`
  );
  return rows.map((r) => ({
    chatId: r.chat_id,
    chatName: r.chat_name ?? r.chat_id,
    chatType: r.chat_type,
    include: !!r.include,
  }));
}

export async function setPrefs(
  personId: string,
  prefs: { chatId: string; include: boolean }[]
): Promise<void> {
  if (prefs.length === 0) return;
  // Small N (a person's chats); upsert each inside one transaction.
  await prisma.$transaction(
    prefs.map(
      (p) =>
        prisma.$executeRaw(
          Prisma.sql`INSERT INTO rc_capture_prefs (person_id, chat_id, include, updated_at)
                     VALUES (${personId}, ${p.chatId}, ${p.include}, now())
                     ON CONFLICT (person_id, chat_id) DO UPDATE
                     SET include = EXCLUDED.include, updated_at = now()`
        )
    )
  );
}
