import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Tuesday strategic meeting: an admin-managed agenda of Sections, each holding
// Topics, plus a dated note per topic (parallel to the Monday sheet). Tables are
// app-owned (see prisma/sql/meeting-strategic.sql) and created on first use.
//
// The agenda is per meeting date: every change is made FOR a date and applies
// from that week on, never to earlier weeks.
//   - added on D: start_date = D (earlier weeks don't show it)
//   - removed on D: end_date = D (earlier weeks still show it, with their notes);
//     if it was added that same week (or later), it's simply deleted
//   - renamed on D: a title row from D on (earlier weeks keep the old name)
// Rows with no dates (the agenda from before this) show on every week.

export type SectionRow = { id: number; title: string };
export type TopicRow = { id: number; sectionId: number; title: string; status: string };

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
  // Per-topic status (open | in_progress | done) — added after the table shipped.
  `ALTER TABLE meeting_topics ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`,
  // Per-week agenda: when a section/topic starts and stops showing, and its
  // name from a given week on.
  `ALTER TABLE meeting_sections ADD COLUMN IF NOT EXISTS start_date DATE`,
  `ALTER TABLE meeting_sections ADD COLUMN IF NOT EXISTS end_date DATE`,
  `ALTER TABLE meeting_topics ADD COLUMN IF NOT EXISTS start_date DATE`,
  `ALTER TABLE meeting_topics ADD COLUMN IF NOT EXISTS end_date DATE`,
  `CREATE TABLE IF NOT EXISTS meeting_section_titles (
     section_id INT NOT NULL,
     from_date  DATE NOT NULL,
     title      TEXT NOT NULL,
     PRIMARY KEY (section_id, from_date)
   )`,
  `CREATE TABLE IF NOT EXISTS meeting_topic_titles (
     topic_id  INT NOT NULL,
     from_date DATE NOT NULL,
     title     TEXT NOT NULL,
     PRIMARY KEY (topic_id, from_date)
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

// Shows on meeting date d: started on/before d (or always) and not yet ended.
const showsOn = (alias: string, d: string) =>
  Prisma.sql`(${Prisma.raw(alias)}.start_date IS NULL OR ${Prisma.raw(alias)}.start_date <= ${d}::date)
         AND (${Prisma.raw(alias)}.end_date IS NULL OR ${Prisma.raw(alias)}.end_date > ${d}::date)`;

export async function listSections(date: string): Promise<SectionRow[]> {
  await ensureStrategicTables();
  return prisma.$queryRaw<SectionRow[]>(Prisma.sql`
    SELECT s.id,
           COALESCE((SELECT t.title FROM meeting_section_titles t
                     WHERE t.section_id = s.id AND t.from_date <= ${date}::date
                     ORDER BY t.from_date DESC LIMIT 1), s.title) AS title
    FROM meeting_sections s
    WHERE ${showsOn("s", date)}
    ORDER BY s.sort_order, s.id`);
}

export async function listTopics(date: string): Promise<TopicRow[]> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number; section_id: number; title: string; status: string }[]>(Prisma.sql`
    SELECT tp.id, tp.section_id, tp.status,
           COALESCE((SELECT t.title FROM meeting_topic_titles t
                     WHERE t.topic_id = tp.id AND t.from_date <= ${date}::date
                     ORDER BY t.from_date DESC LIMIT 1), tp.title) AS title
    FROM meeting_topics tp
    WHERE ${showsOn("tp", date)}
    ORDER BY tp.sort_order, tp.id`);
  return rows.map((r) => ({ id: r.id, sectionId: r.section_id, title: r.title, status: r.status }));
}

// The agenda as it stands on a meeting date; empty if the tables aren't there yet.
export async function listStructureSafe(date: string): Promise<{ sections: SectionRow[]; topics: TopicRow[] }> {
  try {
    const [sections, topics] = await Promise.all([listSections(date), listTopics(date)]);
    return { sections, topics };
  } catch {
    return { sections: [], topics: [] };
  }
}

export async function addSection(title: string, date: string): Promise<number> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO meeting_sections (title, sort_order, start_date)
    VALUES (${title}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM meeting_sections), ${date}::date)
    RETURNING id`);
  return rows[0].id;
}

export async function renameSection(id: number, title: string, date: string): Promise<void> {
  await ensureStrategicTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO meeting_section_titles (section_id, from_date, title) VALUES (${id}, ${date}::date, ${title})
    ON CONFLICT (section_id, from_date) DO UPDATE SET title = EXCLUDED.title`);
}

// Remove a section from date on. One that only started that week (or later)
// never showed before, so it goes for good — with its topics and their notes.
export async function deleteSection(id: number, date: string): Promise<void> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ fresh: boolean }[]>(Prisma.sql`
    SELECT (start_date IS NOT NULL AND start_date >= ${date}::date) AS fresh FROM meeting_sections WHERE id = ${id}`);
  if (!rows.length) return;
  if (!rows[0].fresh) {
    await prisma.$executeRaw(Prisma.sql`UPDATE meeting_sections SET end_date = ${date}::date WHERE id = ${id}`);
    return;
  }
  await prisma.$transaction([
    prisma.$executeRaw(
      Prisma.sql`DELETE FROM meeting_topic_notes WHERE topic_id IN (SELECT id FROM meeting_topics WHERE section_id = ${id})`
    ),
    prisma.$executeRaw(
      Prisma.sql`DELETE FROM meeting_topic_titles WHERE topic_id IN (SELECT id FROM meeting_topics WHERE section_id = ${id})`
    ),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topics WHERE section_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_section_titles WHERE section_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_sections WHERE id = ${id}`),
  ]);
}

export async function addTopic(sectionId: number, title: string, date: string): Promise<number> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO meeting_topics (section_id, title, sort_order, start_date)
    VALUES (${sectionId}, ${title}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM meeting_topics WHERE section_id = ${sectionId}), ${date}::date)
    RETURNING id`);
  return rows[0].id;
}

export async function renameTopic(id: number, title: string, date: string): Promise<void> {
  await ensureStrategicTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO meeting_topic_titles (topic_id, from_date, title) VALUES (${id}, ${date}::date, ${title})
    ON CONFLICT (topic_id, from_date) DO UPDATE SET title = EXCLUDED.title`);
}

export async function setTopicStatus(id: number, status: string): Promise<void> {
  await ensureStrategicTables();
  await prisma.$executeRaw(Prisma.sql`UPDATE meeting_topics SET status = ${status} WHERE id = ${id}`);
}

// Remove a topic from date on (earlier weeks keep it and their notes). One
// added that same week (or later) is deleted outright.
export async function deleteTopic(id: number, date: string): Promise<void> {
  await ensureStrategicTables();
  const rows = await prisma.$queryRaw<{ fresh: boolean }[]>(Prisma.sql`
    SELECT (start_date IS NOT NULL AND start_date >= ${date}::date) AS fresh FROM meeting_topics WHERE id = ${id}`);
  if (!rows.length) return;
  if (!rows[0].fresh) {
    await prisma.$executeRaw(Prisma.sql`UPDATE meeting_topics SET end_date = ${date}::date WHERE id = ${id}`);
    return;
  }
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topic_notes WHERE topic_id = ${id}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM meeting_topic_titles WHERE topic_id = ${id}`),
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
