import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Storage for the Monday tactical meeting (see src/lib/meetings.ts, prisma/sql/
// meetings.sql). Two app-owned tables, created on first use:
//   meeting_notes               one free-text note per house per meeting date
//   meeting_removed_properties  houses taken off the sheet (hidden, never deleted)

const DDL = [
  `CREATE TABLE IF NOT EXISTS meeting_notes (
     property_id  TEXT NOT NULL,
     meeting_date DATE NOT NULL,
     body         TEXT NOT NULL DEFAULT '',
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (property_id, meeting_date)
   )`,
  `CREATE TABLE IF NOT EXISTS meeting_removed_properties (
     property_id TEXT PRIMARY KEY,
     removed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS property_meeting_order (
     property_id TEXT PRIMARY KEY,
     sort_order  INT NOT NULL,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

let tables: Promise<void> | null = null;
export function ensureMeetingTables(): Promise<void> {
  if (!tables) {
    tables = Promise.all(DDL.map((sql) => prisma.$executeRawUnsafe(sql)))
      .then(() => undefined)
      .catch((e) => {
        tables = null; // let a later call retry
        throw e;
      });
  }
  return tables;
}

// Notes entered for one meeting date, by property id.
export async function notesForDate(date: string): Promise<Record<string, string>> {
  await ensureMeetingTables();
  const rows = await prisma.$queryRaw<{ property_id: string; body: string }[]>(
    Prisma.sql`SELECT property_id, body FROM meeting_notes WHERE meeting_date = ${date}::date`
  );
  return Object.fromEntries(rows.map((r) => [r.property_id, r.body]));
}

// The most recent note BEFORE `date` for each property — shown as "last meeting"
// context next to the editable box.
export async function previousNotes(date: string): Promise<Record<string, { date: string; body: string }>> {
  await ensureMeetingTables();
  const rows = await prisma.$queryRaw<{ property_id: string; meeting_date: Date; body: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (property_id) property_id, meeting_date, body
    FROM meeting_notes
    WHERE meeting_date < ${date}::date AND body <> ''
    ORDER BY property_id, meeting_date DESC`);
  return Object.fromEntries(
    rows.map((r) => [r.property_id, { date: new Date(r.meeting_date).toISOString().slice(0, 10), body: r.body }])
  );
}

// Save (or clear) one house's note for a meeting date. An empty note deletes the
// row so the history stays clean.
export async function upsertMeetingNote(propertyId: string, date: string, body: string): Promise<void> {
  await ensureMeetingTables();
  const trimmed = body.trim();
  if (!trimmed) {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM meeting_notes WHERE property_id = ${propertyId} AND meeting_date = ${date}::date`
    );
    return;
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO meeting_notes (property_id, meeting_date, body, updated_at)
    VALUES (${propertyId}, ${date}::date, ${trimmed}, now())
    ON CONFLICT (property_id, meeting_date) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`);
}

// Whether a property is currently active (used to block removing active houses
// from the meeting sheet).
export async function isPropertyActive(propertyId: string): Promise<boolean> {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { status: true } });
  return p?.status === "active";
}

// Houses removed from the sheet.
export async function removedPropertyIds(): Promise<Set<string>> {
  await ensureMeetingTables();
  const rows = await prisma.$queryRaw<{ property_id: string }[]>(
    Prisma.sql`SELECT property_id FROM meeting_removed_properties`
  );
  return new Set(rows.map((r) => r.property_id));
}

export async function setPropertyRemoved(propertyId: string, removed: boolean): Promise<void> {
  await ensureMeetingTables();
  if (removed) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO meeting_removed_properties (property_id, removed_at)
      VALUES (${propertyId}, now()) ON CONFLICT (property_id) DO NOTHING`);
  } else {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_removed_properties WHERE property_id = ${propertyId}`);
  }
}

// The admin's custom sequence: property id → position. Houses not listed sort to
// the end (splitMeetingGroups handles the fallback).
export async function getPropertyOrder(): Promise<Record<string, number>> {
  await ensureMeetingTables();
  const rows = await prisma.$queryRaw<{ property_id: string; sort_order: number }[]>(
    Prisma.sql`SELECT property_id, sort_order FROM property_meeting_order`
  );
  return Object.fromEntries(rows.map((r) => [r.property_id, r.sort_order]));
}

// Replace the saved sequence with this exact ordered list (position = index).
export async function savePropertyOrder(ids: string[]): Promise<void> {
  await ensureMeetingTables();
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM property_meeting_order`),
    ...ids.map((id, i) =>
      prisma.$executeRaw(
        Prisma.sql`INSERT INTO property_meeting_order (property_id, sort_order) VALUES (${id}, ${i})`
      )
    ),
  ]);
}
