-- Web Push (iPhone/desktop notifications for the installed PWA).
--
-- Two tables, both created on first use by ensurePushTables() in
-- src/lib/push-db.ts (like the plaid_* / transaction_hide_rules tables), so
-- running this is optional. Additive + idempotent.
--
--   npx prisma db execute --file prisma/sql/push.sql --schema prisma/schema.prisma

-- The app's VAPID keypair, generated once on first use and kept server-side so
-- no env secret is needed. The private key never leaves the server; the public
-- key is handed to the browser to subscribe.
CREATE TABLE IF NOT EXISTS push_config (
    id          INT PRIMARY KEY DEFAULT 1,
    public_key  TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT push_config_singleton CHECK (id = 1)
);

-- One row per browser/device that opted in (keyed on the push endpoint). A user
-- can have several (phone, laptop, …); user_email/user_id tie it to the account.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT,
    user_email TEXT,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,       -- subscription.keys.p256dh
    auth       TEXT NOT NULL,       -- subscription.keys.auth
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_email_idx ON push_subscriptions (user_email);

-- Per-user notification preferences: which categories each person opted into.
-- Absent row = off. Admin-only categories are enforced server-side at save time
-- (see src/lib/notification-categories.ts).
CREATE TABLE IF NOT EXISTS notification_prefs (
    user_email TEXT NOT NULL,
    category   TEXT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_email, category)
);

CREATE INDEX IF NOT EXISTS notification_prefs_category_idx ON notification_prefs (category) WHERE enabled;
