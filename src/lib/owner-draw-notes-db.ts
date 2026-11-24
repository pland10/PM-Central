import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureOwnerDrawTables } from "@/lib/owner-draws-db";
import type { WorkOrderNote as Note } from "@/lib/work-order-notes";
import type { NoteSummary } from "@/lib/work-order-notes-db";

// Storage for Owner Draws notes (see ./owner-draw-notes.ts,
// prisma/sql/owner-draws.sql). One thread per portfolio; each note keeps the
// month it was written for. App-owned, created on first use; the old single
// note per row (owner_draws.note) is copied in once.

const DDL = [
  `CREATE TABLE IF NOT EXISTS owner_draw_notes (
     id           SERIAL PRIMARY KEY,
     portfolio_id TEXT NOT NULL,
     month        TEXT NOT NULL,
     body         TEXT NOT NULL,
     author_email TEXT,
     author_name  TEXT,
     emailed_to   TEXT,
     emailed_at   TIMESTAMPTZ,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     edited_at    TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS owner_draw_notes_portfolio_idx ON owner_draw_notes (portfolio_id, created_at DESC)`,
  // One-time copy of the old single note per row; flagged in the same
  // statement so it never repeats and a deleted note doesn't come back.
  `ALTER TABLE owner_draws ADD COLUMN IF NOT EXISTS note_migrated BOOLEAN NOT NULL DEFAULT false`,
  `WITH moved AS (
     UPDATE owner_draws SET note_migrated = true
     WHERE note_migrated = false AND btrim(note) <> ''
     RETURNING portfolio_id, month, note, updated_by, updated_at
   )
   INSERT INTO owner_draw_notes (portfolio_id, month, body, author_name, created_at)
   SELECT portfolio_id, month, btrim(note), COALESCE(updated_by, 'Earlier note'), updated_at FROM moved`,
];

let tables: Promise<void> | null = null;
export function ensureOwnerDrawNotes(): Promise<void> {
  if (!tables) {
    tables = (async () => {
      await ensureOwnerDrawTables();
      for (const sql of DDL) await prisma.$executeRawUnsafe(sql);
    })().catch((e) => {
      tables = null;
      throw e;
    });
  }
  return tables;
}

type RawNote = {
  id: number;
  body: string;
  author_name: string | null;
  author_email: string | null;
  created_at: Date | null;
  edited_at: Date | null;
  emailed_to: string | null;
};
const COLS = Prisma.sql`id, body, author_name, author_email, created_at, edited_at, emailed_to`;
const toNote = (r: RawNote): Note => ({
  id: Number(r.id),
  body: r.body,
  authorName: r.author_name ?? "",
  authorEmail: r.author_email ?? "",
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
  emailedTo: r.emailed_to ?? null,
});

export async function listOwnerDrawNotes(portfolioId: string): Promise<Note[]> {
  await ensureOwnerDrawNotes();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    SELECT ${COLS} FROM owner_draw_notes WHERE portfolio_id = ${portfolioId}
    ORDER BY created_at DESC, id DESC`);
  return rows.map(toNote);
}

export async function ownerDrawNoteAuthor(id: number): Promise<string | null> {
  await ensureOwnerDrawNotes();
  const rows = await prisma.$queryRaw<{ author_email: string | null }[]>(Prisma.sql`
    SELECT author_email FROM owner_draw_notes WHERE id = ${id}`);
  return rows.length ? (rows[0].author_email ?? "") : null;
}

export async function updateOwnerDrawNote(id: number, body: string): Promise<Note | null> {
  await ensureOwnerDrawNotes();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    UPDATE owner_draw_notes SET body = ${body}, edited_at = now() WHERE id = ${id} RETURNING ${COLS}`);
  return rows.length ? toNote(rows[0]) : null;
}

export async function deleteOwnerDrawNote(id: number): Promise<boolean> {
  await ensureOwnerDrawNotes();
  return (await prisma.$executeRaw(Prisma.sql`DELETE FROM owner_draw_notes WHERE id = ${id}`)) > 0;
}

export async function addOwnerDrawNote(n: {
  portfolioId: string;
  month: string;
  body: string;
  authorEmail: string;
  authorName: string;
}): Promise<Note> {
  await ensureOwnerDrawNotes();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    INSERT INTO owner_draw_notes (portfolio_id, month, body, author_email, author_name)
    VALUES (${n.portfolioId}, ${n.month}, ${n.body}, ${n.authorEmail}, ${n.authorName})
    RETURNING ${COLS}`);
  return toNote(rows[0]);
}

export async function markOwnerDrawNoteEmailed(id: number, to: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE owner_draw_notes SET emailed_to = ${to}, emailed_at = now() WHERE id = ${id}`);
}

// Per portfolio: how many notes and the newest, for the Notes column. Empty if
// the table can't be read.
export async function ownerDrawNoteSummaries(): Promise<Record<string, NoteSummary>> {
  try {
    await ensureOwnerDrawNotes();
    const rows = await prisma.$queryRaw<
      { portfolio_id: string; body: string; author_name: string | null; created_at: Date; n: number }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (portfolio_id) portfolio_id, body, author_name, created_at,
             COUNT(*) OVER (PARTITION BY portfolio_id)::int AS n
      FROM owner_draw_notes
      ORDER BY portfolio_id, created_at DESC, id DESC`);
    return Object.fromEntries(
      rows.map((r) => [
        r.portfolio_id,
        { count: Number(r.n), latest: r.body, latestAt: new Date(r.created_at).toISOString(), latestBy: r.author_name ?? "" },
      ])
    );
  } catch {
    return {};
  }
}
