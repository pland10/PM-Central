import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../helpers/sql";
import { listTtMessages, saveTtMessages } from "@/lib/tenantturner/messages-db";

afterEach(() => vi.clearAllMocks());

function fakePrisma(routes: [RegExp, unknown[] | Error][] = []) {
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(routes));
  return { prisma: { $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw } as unknown as PrismaClient, executeRawUnsafe, queryRaw };
}

describe("saveTtMessages", () => {
  it("stores each email once (by its Gmail id) and says how many were new", async () => {
    const { prisma, executeRawUnsafe, queryRaw } = fakePrisma([[/INSERT INTO tenantturner_messages/, [{ gmail_id: "g1" }]]]);
    const n = await saveTtMessages(prisma, [
      { gmailId: "g1", receivedAt: new Date("2026-11-19T13:39:41Z"), leadName: "Ann Lee", agentName: "Paul", text: "Got it" },
      { gmailId: "g0", receivedAt: new Date("2026-11-19T13:32:56Z"), leadName: null, agentName: "Paul", text: "Hi" },
    ]);
    expect(n).toBe(1);
    expect(executeRawUnsafe.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS tenantturner_messages/);
    const q = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlOf(q)).toMatch(/ON CONFLICT \(gmail_id\) DO NOTHING RETURNING gmail_id/);
    expect(q.values).toEqual(expect.arrayContaining(["g1", "Ann Lee", "Paul", "Got it", "g0", null]));
  });

  it("does nothing for no messages", async () => {
    const { prisma, queryRaw } = fakePrisma();
    expect(await saveTtMessages(prisma, [])).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("listTtMessages", () => {
  it("returns recent replies, newest first", async () => {
    const { prisma, queryRaw } = fakePrisma([
      [
        /FROM tenantturner_messages/,
        [{ gmail_id: "g1", received_at: new Date("2026-11-19T13:39:41Z"), lead_name: "Ann Lee", agent_name: "Paul", body: "Got it" }],
      ],
    ]);
    expect(await listTtMessages(prisma)).toEqual([
      { id: "g1", receivedAt: "2026-11-19T13:39:41.000Z", leadName: "Ann Lee", agentName: "Paul", text: "Got it" },
    ]);
    expect(sqlOf(queryRaw.mock.calls[0][0])).toMatch(/ORDER BY received_at DESC/);
  });

  it("degrades to nothing if the table isn't there", async () => {
    const { prisma } = fakePrisma([[/FROM tenantturner_messages/, new Error("boom")]]);
    expect(await listTtMessages(prisma)).toEqual([]);
  });
});
