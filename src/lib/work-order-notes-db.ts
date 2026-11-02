import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkOrderNote } from "@/lib/work-order-notes";

// Storage for work-order notes (prisma/sql/work_order_notes.sql). Keyed by the
// LeadSimple process id (work_orders.source_id, WorkOrderRow.id). Not in
// schema.prisma; created on first use.

const DDL = [
  `CREATE TABLE IF NOT EXISTS work_order_notes (
     id           SERIAL PRIMARY KEY,
     wo_id        TEXT NOT NULL,
     wo_number    TEXT,
     body         TEXT NOT NULL,
     author_email TEXT,
     author_name  TEXT,
     emailed_to   TEXT,
     emailed_at   TIMESTAMPTZ,
     created_at   TIMESTAMPTZ DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS work_order_notes_wo_idx ON work_order_notes (wo_id, created_at DESC)`,
];

let table: Promise<void> | null = null;
export function ensureNotesTable(): Promise<void> {
  if (!table) {
    table = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      table = null; // let a later call retry
      throw e;
    });
  }
  return table;
}

type RawNote = {
  id: number;
  body: string;
  author_name: string | null;
  author_email: string | null;
  created_at: Date | null;
  emailed_to: string | null;
};
const toNote = (r: RawNote): WorkOrderNote => ({
  id: Number(r.id),
  body: r.body,
  authorName: r.author_name ?? "",
  authorEmail: r.author_email ?? "",
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  emailedTo: r.emailed_to ?? null,
});

export async function listNotes(woId: string): Promise<WorkOrderNote[]> {
  await ensureNotesTable();
  const rows = await prisma.$queryRaw<RawNote[]>(Prisma.sql`
    SELECT id, body, author_name, author_email, created_at, emailed_to
    FROM work_order_notes WHERE wo_id = ${woId}
    ORDER BY created_at DESC`);
  return rows.map(toNote);
}

export async function addNote(n: {
  woId: string;
  woNumber: string;
  body: string;
  authorEmail: string;
  authorName: string;
}): Promise<WorkOrderNote> {
  await ensureNotesTable();
  const [row] = await prisma.$queryRaw<{ id: number; created_at: Date }[]>(Prisma.sql`
    INSERT INTO work_order_notes (wo_id, wo_number, body, author_email, author_name)
    VALUES (${n.woId}, ${n.woNumber}, ${n.body}, ${n.authorEmail}, ${n.authorName})
    RETURNING id, created_at`);
  return {
    id: Number(row.id),
    body: n.body,
    authorName: n.authorName,
    authorEmail: n.authorEmail,
    createdAt: new Date(row.created_at).toISOString(),
    emailedTo: null,
  };
}

export async function markEmailed(id: number, to: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`UPDATE work_order_notes SET emailed_to = ${to}, emailed_at = now() WHERE id = ${id}`);
}

export type NoteSummary = { count: number; latest: string; latestAt: string; latestBy: string };

// Per work order: how many notes and the newest one — for the list's Notes
// column. Empty if the table isn't there yet.
export async function noteSummaries(): Promise<Record<string, NoteSummary>> {
  try {
    await ensureNotesTable();
    const rows = await prisma.$queryRaw<
      { wo_id: string; body: string; author_name: string | null; created_at: Date; n: number }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (wo_id) wo_id, body, author_name, created_at,
             COUNT(*) OVER (PARTITION BY wo_id)::int AS n
      FROM work_order_notes
      ORDER BY wo_id, created_at DESC`);
    return Object.fromEntries(
      rows.map((r) => [
        r.wo_id,
        { count: Number(r.n), latest: r.body, latestAt: new Date(r.created_at).toISOString(), latestBy: r.author_name ?? "" },
      ])
    );
  } catch {
    return {};
  }
}
