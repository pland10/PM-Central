-- Tuesday strategic meeting tables (see src/lib/meeting-topics-db.ts).
--
-- Applied with `prisma db execute` (see DEPLOY.md), NOT `prisma db push`:
-- this database also holds tables that aren't modeled in schema.prisma, and
-- `db push` would try to DROP them. App-owned (not Prisma models) and also
-- created on first use by ensureStrategicTables(); this is the explicit,
-- idempotent DDL, safe to run more than once on both Neon branches.

-- An admin-managed agenda: Sections hold Topics.
CREATE TABLE IF NOT EXISTS meeting_sections (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_topics (
    id         SERIAL PRIMARY KEY,
    section_id INT NOT NULL,
    title      TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | done
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Added after the table first shipped; idempotent for existing databases.
ALTER TABLE meeting_topics ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- One dated note per topic per meeting date (the strategic history).
CREATE TABLE IF NOT EXISTS meeting_topic_notes (
    topic_id     INT NOT NULL,
    meeting_date DATE NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (topic_id, meeting_date)
);
