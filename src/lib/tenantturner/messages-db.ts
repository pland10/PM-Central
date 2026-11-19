import { Prisma, type PrismaClient } from "@prisma/client";

// Storage for Tenant Turner lead replies (./messages.ts): one row per
// notification email, keyed by its Gmail message id so re-sends are ignored.
// App-owned raw table (db-change Pattern B; DDL also in
// prisma/sql/tenantturner-messages.sql).

const DDL = [
  `CREATE TABLE IF NOT EXISTS tenantturner_messages (
     gmail_id    TEXT PRIMARY KEY,
     received_at TIMESTAMPTZ NOT NULL,
     lead_name   TEXT,
     agent_name  TEXT,
     body        TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS tenantturner_messages_received_idx ON tenantturner_messages (received_at DESC)`,
];

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export type TtMessageInput = {
  gmailId: string;
  receivedAt: Date;
  leadName: string | null;
  agentName: string | null;
  text: string;
};

// Store new replies; returns how many weren't already stored.
export async function saveTtMessages(prisma: PrismaClient, rows: TtMessageInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureTable(prisma);
  const values = rows.map((r) => Prisma.sql`(${r.gmailId}, ${r.receivedAt}, ${r.leadName}, ${r.agentName}, ${r.text})`);
  const inserted = await prisma.$queryRaw<{ gmail_id: string }[]>(Prisma.sql`
    INSERT INTO tenantturner_messages (gmail_id, received_at, lead_name, agent_name, body)
    VALUES ${Prisma.join(values)}
    ON CONFLICT (gmail_id) DO NOTHING RETURNING gmail_id`);
  return inserted.length;
}

export type TtMessage = { id: string; receivedAt: string; leadName: string | null; agentName: string | null; text: string };

// Recent replies, newest first. Never throws (the page just shows none).
export async function listTtMessages(prisma: PrismaClient, days = 60, limit = 500): Promise<TtMessage[]> {
  try {
    await ensureTable(prisma);
    const rows = await prisma.$queryRaw<
      { gmail_id: string; received_at: Date; lead_name: string | null; agent_name: string | null; body: string }[]
    >(Prisma.sql`
      SELECT gmail_id, received_at, lead_name, agent_name, body FROM tenantturner_messages
       WHERE received_at > now() - (${days}::int * interval '1 day')
       ORDER BY received_at DESC
       LIMIT ${limit}::int`);
    return rows.map((r) => ({
      id: r.gmail_id,
      receivedAt: new Date(r.received_at).toISOString(),
      leadName: r.lead_name,
      agentName: r.agent_name,
      text: r.body,
    }));
  } catch {
    return [];
  }
}
