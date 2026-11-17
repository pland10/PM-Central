-- Close calendar: recurring month-end / financial deadlines with a task each
-- (Calendar page). App-owned tables, NOT in schema.prisma — additive and
-- idempotent like the other raw tables. Also created in code by
-- src/lib/calendar/db.ts (db-change skill, Pattern B); this file is the
-- canonical definition. Apply with:
--   npx prisma db execute --file prisma/sql/calendar.sql --schema prisma/schema.prisma

-- One row per recurring event. `rule` says where in the month it falls
-- (ME-5, ME-5BD, MS+3, D10, BD3, BD-1 — see src/lib/calendar/rules.ts).
CREATE TABLE IF NOT EXISTS calendar_events (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    rule        TEXT NOT NULL,
    frequency   TEXT NOT NULL DEFAULT 'monthly', -- daily (every business day; rule DAILY) | weekly (rule WEEKLY:MO,WE,FR) | monthly | quarterly | yearly
    month       INT,                             -- yearly: 1–12; quarterly: month of the quarter 1–3; monthly: NULL
    adjust      TEXT NOT NULL DEFAULT 'prior',   -- weekend/holiday: prior | next | none (calendar-day rules)
    owner_email TEXT,                            -- who the task is for (gets the alert)
    owner_name  TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A task checked off: one row per event per month ("YYYY-MM"), or per day
-- ("YYYY-MM-DD") for a daily or weekly event.
CREATE TABLE IF NOT EXISTS calendar_task_status (
    event_id     INT NOT NULL,                   -- → calendar_events.id
    period       TEXT NOT NULL,
    done_by      TEXT,
    done_by_name TEXT,
    done_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, period)
);

-- Single row: `seeded` makes the starter set load only once.
CREATE TABLE IF NOT EXISTS calendar_settings (
    id     INT PRIMARY KEY DEFAULT 1,
    seeded BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT calendar_settings_single CHECK (id = 1)
);
INSERT INTO calendar_settings (id, seeded) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- Daily summary email: who gets it (comma-separated), and the last day it went
-- out — claimed atomically so the 6am send happens once a day.
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS digest_to TEXT NOT NULL DEFAULT '';
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS digest_last_sent DATE;

-- Each person's calendar color (they pick their own). color is UNIQUE so no
-- two people can share one; values come from src/lib/calendar/colors.ts.
CREATE TABLE IF NOT EXISTS calendar_user_colors (
    user_email TEXT PRIMARY KEY,                 -- lower-case login email
    color      TEXT NOT NULL UNIQUE,             -- hex, e.g. #2563EB
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
