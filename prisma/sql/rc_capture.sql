-- RingCentral multi-user capture: opt-in tables.
--
-- Idempotent + additive (CREATE TABLE IF NOT EXISTS) so it is safe to apply to
-- the shared Neon DB — it never drops anything. rc_available_chats and
-- rc_capture_prefs are also created by the leadsimple-search chat sync
-- (rc_chat_sync.py); this file is the canonical definition and also creates
-- rc_user_links, which maps a PM-Central login to its RingCentral person so the
-- Capture settings page can show each person their own chats.
--
-- Apply with (see DEPLOY.md):
--   prisma db execute --file prisma/sql/rc_capture.sql --schema prisma/schema.prisma
-- (The app also self-creates these on first use, so this is mainly for a fresh DB.)

-- Each person's chat list (names only — never message content).
CREATE TABLE IF NOT EXISTS rc_available_chats (
    person_id   text NOT NULL,
    person_name text,
    chat_id     text NOT NULL,
    chat_name   text,
    chat_type   text,
    updated_at  timestamptz DEFAULT now(),
    PRIMARY KEY (person_id, chat_id)
);

-- Which chats each person has opted in to capturing.
CREATE TABLE IF NOT EXISTS rc_capture_prefs (
    person_id  text NOT NULL,
    chat_id    text NOT NULL,
    include    boolean NOT NULL DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (person_id, chat_id)
);

-- Maps a PM-Central login email to its RingCentral person id, so a logged-in
-- user sees their own chats on the Capture settings page.
CREATE TABLE IF NOT EXISTS rc_user_links (
    pmc_email  text PRIMARY KEY,
    person_id  text NOT NULL,
    updated_at timestamptz DEFAULT now()
);
