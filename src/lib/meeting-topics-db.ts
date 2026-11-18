import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Tuesday strategic meeting: an admin-managed agenda of Sections, each holding
// Topics, plus a dated note per topic (parallel to the Monday sheet). Tables are
// app-owned (see prisma/sql/meeting-strategic.sql) and created on first use.

export type SectionRow = { id: number; title: string };
export type TopicRow = { id: number; sectionId: number; title: string };

const DDL = [
  `CREATE TABLE IF NOT EXISTS meeting_sections (
     id         SERIAL PRIMARY KEY,
     title      TEXT NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS meeting_topics (
     id         SERIAL PRIMARY KEY,
     section_id INT NOT NULL,
     title      TEXT NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS meeting_topic_notes (
     topic_id     INT NOT NULL,
     meeting_date DATE NOT NULL,
     body         TEXT NOT NULL DEFAULT '',
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (topic_id, meeting_date)
   )`,
];

let tables: Promise<void> | null = null;
export function ensureStrategicTables(): Promise<void> {
  if (!tables) {
    tables = DDL.reduce<Promise<unknown>>((p, sql) => p.then(() => prisma.$executeRawUnsafe(sql)), Promise.resolve())
      .then(() => undefined)
      .catch((e) => {
        tables = null;
        throw e;
      });
  }
  return tables;
}

export async function listSections(): Promise<SectionRow[]> {
  await ensureStrategicTables();
  return prisma.$queryRaw<SectionRow[]>(
    Prisma.sql`SELECT id, title FROM meeting_sections ORDER BY sort_order, id`
  );
}

export async function listTopics(): Promise<TopicRow[]> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number; section_id: number; title: string }[]>(
    Prisma.sql`SELECT id, section_id, title FROM meeting_topics ORDER BY sort_order, id`
  );
  return rows.map((r) => ({ id: r.id, sectionId: r.section_id, title: r.title }));
}

// Structure for the admin + strategic page; empty if the tables aren't there yet.
export async function listStructureSafe(): Promise<{ sections: SectionRow[]; topics: TopicRow[] }> {
  try {
    const [sections, topics] = await Promise.all([listSections(), listTopics()]);
    return { sections, topics };
  } catch {
    return { sections: [], topics: [] };
  }
}

export async function addSection(title: string): Promise<number> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO meeting_sections (title, sort_order)
    VALUES (${title}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM meeting_sections))
    RETURNING id`);
  return rows[0].id;
}

export async function renameSection(id: number, title: string): Promise<void> {
  await ensureStrategicTables();
  await prisma.$executeRaw(Prisma.sql`UPDATE meeting_sections SET title = ${title} WHERE id = ${id}`);
}

// Removing a section takes its topics and their notes with it.
export async function deleteSection(id: number): Promise<void> {
  await ensureStrategicTables();
  await prisma.$transaction([
    prisma.$executeRaw(
      Prisma.sql`DELETE FROM meeting_topic_notes WHERE topic_id IN (SELECT id FROM meeting_topics WHERE section_id = ${id})`
    ),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topics WHERE section_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_sections WHERE id = ${id}`),
  ]);
}

export async function addTopic(sectionId: number, title: string): Promise<number> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO meeting_topics (section_id, title, sort_order)
    VALUES (${sectionId}, ${title}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM meeting_topics WHERE section_id = ${sectionId}))
    RETURNING id`);
  return rows[0].id;
}

export async function renameTopic(id: number, title: string): Promise<void> {
  await ensureStrategicTables();
  await prisma.$executeRaw(Prisma.sql`UPDATE meeting_topics SET title = ${title} WHERE id = ${id}`);
}

export async function deleteTopic(id: number): Promise<void> {
  await ensureStrategicTables();
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topic_notes WHERE topic_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topics WHERE id = ${id}`),
  ]);
}

// --- Topic notes (dated, parallel to the tactical sheet) ---

export async function topicNotesForDate(date: string): Promise<Record<number, string>> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ topic_id: number; body: string }[]>(
    Prisma.sql`SELECT topic_id, body FROM meeting_topic_notes WHERE meeting_date = ${date}::date`
  );
  return Object.fromEntries(rows.map((r) => [r.topic_id, r.body]));
}

export async function topicPreviousNotes(date: string): Promise<Record<number, { date: string; body: string }>> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ topic_id: number; meeting_date: Date; body: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (topic_id) topic_id, meeting_date, body
    FROM meeting_topic_notes
    WHERE meeting_date < ${date}::date AND body <> ''
    ORDER BY topic_id, meeting_date DESC`);
  return Object.fromEntries(
    rows.map((r) => [r.topic_id, { date: new Date(r.meeting_date).toISOString().slice(0, 10), body: r.body }])
  );
}

export async function upsertTopicNote(topicId: number, date: string, body: string): Promise<void> {
  await ensureStrategicTables();
  const trimmed = body.trim();
  if (!trimmed) {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM meeting_topic_notes WHERE topic_id = ${topicId} AND meeting_date = ${date}::date`
    );
    return;
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO meeting_topic_notes (topic_id, meeting_date, body, updated_at)
    VALUES (${topicId}, ${date}::date, ${trimmed}, now())
    ON CONFLICT (topic_id, meeting_date) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`);
}
