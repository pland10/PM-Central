import webpush from "web-push";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Storage for Web Push (see prisma/sql/push.sql): the app's VAPID keypair
// (auto-generated, kept server-side) and one row per subscribed device. Tables
// are created on first use so no manual SQL step is needed.

let tables: Promise<void> | null = null;
export function ensurePushTables(): Promise<void> {
  if (!tables) {
    tables = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS push_config (
           id INT PRIMARY KEY DEFAULT 1,
           public_key TEXT NOT NULL,
           private_key TEXT NOT NULL,
           created_at TIMESTAMPTZ DEFAULT now(),
           CONSTRAINT push_config_singleton CHECK (id = 1)
         )`
      );
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
           id SERIAL PRIMARY KEY,
           user_id TEXT,
           user_email TEXT,
           endpoint TEXT NOT NULL UNIQUE,
           p256dh TEXT NOT NULL,
           auth TEXT NOT NULL,
           user_agent TEXT,
           created_at TIMESTAMPTZ DEFAULT now(),
           last_used TIMESTAMPTZ
         )`
      );
    })()
      .then(() => undefined)
      .catch((e) => {
        tables = null; // let a later call retry
        throw e;
      });
  }
  return tables;
}

export type VapidKeys = { publicKey: string; privateKey: string };

// The app's VAPID keypair — generated once and stored, so a redeploy keeps the
// same keys (existing subscriptions stay valid). Concurrent first-callers race
// safely via the singleton primary key.
export async function getVapidKeys(): Promise<VapidKeys> {
  await ensurePushTables();
  const rows = await prisma.$queryRaw<{ public_key: string; private_key: string }[]>(
    Prisma.sql`SELECT public_key, private_key FROM push_config WHERE id = 1`
  );
  if (rows[0]) return { publicKey: rows[0].public_key, privateKey: rows[0].private_key };

  const keys = webpush.generateVAPIDKeys();
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO push_config (id, public_key, private_key)
               VALUES (1, ${keys.publicKey}, ${keys.privateKey})
               ON CONFLICT (id) DO NOTHING`
  );
  const after = await prisma.$queryRaw<{ public_key: string; private_key: string }[]>(
    Prisma.sql`SELECT public_key, private_key FROM push_config WHERE id = 1`
  );
  return { publicKey: after[0].public_key, privateKey: after[0].private_key };
}

export async function getVapidPublicKey(): Promise<string> {
  return (await getVapidKeys()).publicKey;
}

export type SubscriptionInput = {
  userId: string | null;
  userEmail: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export async function saveSubscription(s: SubscriptionInput): Promise<void> {
  await ensurePushTables();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO push_subscriptions (user_id, user_email, endpoint, p256dh, auth, user_agent, last_used)
    VALUES (${s.userId}, ${s.userEmail}, ${s.endpoint}, ${s.p256dh}, ${s.auth}, ${s.userAgent}, now())
    ON CONFLICT (endpoint) DO UPDATE
      SET user_id = EXCLUDED.user_id, user_email = EXCLUDED.user_email,
          p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent, last_used = now()`);
}

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

// Subscriptions for a user (matched by id or email — whichever we have).
export async function listSubscriptions(userId: string | null, userEmail: string | null): Promise<StoredSubscription[]> {
  await ensurePushTables();
  const rows = await prisma.$queryRaw<StoredSubscription[]>(Prisma.sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE (${userId}::text IS NOT NULL AND user_id = ${userId})
       OR (${userEmail}::text IS NOT NULL AND user_email = ${userEmail})`);
  return rows;
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await ensurePushTables();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`);
}
