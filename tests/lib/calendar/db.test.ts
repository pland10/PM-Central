import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../../helpers/sql";
import {
  claimDigestSend,
  createCalendarEvent,
  getDigestRecipients,
  releaseDigestSend,
  setDigestRecipients,
  deleteCalendarEvent,
  listCalendarEvents,
  listTaskStatuses,
  setTaskStatus,
  updateCalendarEvent,
} from "@/lib/calendar/db";
import { STARTER_EVENTS } from "@/lib/calendar/events";

afterEach(() => vi.clearAllMocks());

const ROW = {
  id: 7, title: "Reimbursables review", description: "", rule: "ME-5", frequency: "monthly", month: null,
  adjust: "prior", owner_email: "ari@pmi.com", owner_name: "Ari", active: true,
};

function fake(queries: [RegExp, unknown[]][] = []) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(queries));
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops));
  const prisma = { $executeRaw: executeRaw, $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw, $transaction: transaction } as unknown as PrismaClient;
  return { prisma, executeRaw, executeRawUnsafe, queryRaw, transaction };
}

describe("listCalendarEvents", () => {
  it("creates the tables, seeds the starter set once (atomically), and maps the rows", async () => {
    const f = fake([[/FROM calendar_events/, [ROW]]]);
    const events = await listCalendarEvents(f.prisma);
    const ddl = f.executeRawUnsafe.mock.calls.map((c) => c[0]).join("\n");
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS calendar_events/);
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS calendar_task_status/);
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS calendar_settings/);
    expect(ddl).toMatch(/ADD COLUMN IF NOT EXISTS digest_to/);
    expect(ddl).toMatch(/ADD COLUMN IF NOT EXISTS digest_last_sent/);
    const seed = f.executeRaw.mock.calls.map((c) => c[0] as { values: unknown[] }).find((q) => /INSERT INTO calendar_events/.test(sqlOf(q)))!;
    expect(sqlOf(seed)).toMatch(/UPDATE calendar_settings SET seeded = true WHERE id = 1 AND NOT seeded/);
    expect(seed.values).toEqual(expect.arrayContaining(STARTER_EVENTS.map((e) => e.title)));
    expect(events).toEqual([
      { id: 7, title: "Reimbursables review", description: "", rule: "ME-5", frequency: "monthly", month: null, adjust: "prior", ownerEmail: "ari@pmi.com", ownerName: "Ari", active: true },
    ]);
  });
});

describe("event changes", () => {
  const input = { title: "T", description: "", rule: "D10", frequency: "monthly" as const, month: null, adjust: "prior" as const, ownerEmail: null };

  it("creates and returns the event", async () => {
    const f = fake([[/INSERT INTO calendar_events/, [{ ...ROW, id: 9, title: "T", rule: "D10", owner_email: null, owner_name: null }]]]);
    const e = await createCalendarEvent(f.prisma, { ...input, ownerName: null }, "paul@pmi.com");
    expect(e).toMatchObject({ id: 9, title: "T", rule: "D10", ownerEmail: null });
  });

  it("updates an event, or returns null when it's gone", async () => {
    const f = fake([[/UPDATE calendar_events/, [{ ...ROW, title: "T" }]]]);
    expect(await updateCalendarEvent(f.prisma, 7, { ...input, ownerName: null })).toMatchObject({ id: 7, title: "T" });
    const g = fake([[/UPDATE calendar_events/, []]]);
    expect(await updateCalendarEvent(g.prisma, 7, { ...input, ownerName: null })).toBeNull();
  });

  it("deletes an event with its check-offs", async () => {
    const f = fake();
    expect(await deleteCalendarEvent(f.prisma, 7)).toBe(true);
    const sqls = f.executeRaw.mock.calls.map((c) => sqlOf(c[0]));
    expect(sqls).toEqual([expect.stringMatching(/DELETE FROM calendar_task_status WHERE event_id/), expect.stringMatching(/DELETE FROM calendar_events WHERE id/)]);
    expect(f.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("task check-offs", () => {
  it("lists check-offs for the given months, keyed event:period", async () => {
    const f = fake([[/FROM calendar_task_status/, [{ event_id: 7, period: "2026-11", done_by: "ari@pmi.com", done_by_name: "Ari", done_at: new Date("2026-11-24T15:00:00Z") }]]]);
    expect(await listTaskStatuses(f.prisma, ["2026-11"])).toEqual({
      "7:2026-11": { doneBy: "ari@pmi.com", doneByName: "Ari", doneAt: "2026-11-24T15:00:00.000Z" },
    });
    expect(await listTaskStatuses(fake().prisma, [])).toEqual({});
    // matches by month, so daily check-offs ("2026-11-24") come back with the month too
    expect(sqlOf(f.queryRaw.mock.calls[0][0])).toMatch(/WHERE left\(period, 7\) IN/);
  });

  it("checks off (upsert) only an existing event, and unchecks", async () => {
    const f = fake([[/INSERT INTO calendar_task_status/, [{ done_by: "ari@pmi.com", done_by_name: "Ari", done_at: new Date("2026-11-24T15:00:00Z") }]]]);
    expect(await setTaskStatus(f.prisma, 7, "2026-11", true, "ari@pmi.com", "Ari")).toEqual({
      ok: true,
      status: { doneBy: "ari@pmi.com", doneByName: "Ari", doneAt: "2026-11-24T15:00:00.000Z" },
    });
    const insert = f.queryRaw.mock.calls.find((c) => /INSERT INTO calendar_task_status/.test(sqlOf(c[0])))![0];
    expect(sqlOf(insert)).toMatch(/WHERE EXISTS \(SELECT 1 FROM calendar_events WHERE id = /);

    const gone = fake([[/INSERT INTO calendar_task_status/, []]]);
    expect(await setTaskStatus(gone.prisma, 99, "2026-11", true, "a", "A")).toEqual({ ok: false });

    const un = fake();
    expect(await setTaskStatus(un.prisma, 7, "2026-11", false, "a", "A")).toEqual({ ok: true, status: null });
    expect(sqlOf(un.executeRaw.mock.calls[0][0])).toMatch(/DELETE FROM calendar_task_status WHERE event_id = .* AND period = /);
  });
});

describe("daily summary settings", () => {
  it("adds the settings columns, reads and saves the recipients", async () => {
    const f = fake([[/SELECT digest_to FROM calendar_settings/, [{ digest_to: "paul@pmi.com,ari@pmi.com" }]]]);
    expect(await getDigestRecipients(f.prisma)).toEqual(["paul@pmi.com", "ari@pmi.com"]);
    await setDigestRecipients(f.prisma, ["paul@pmi.com"]);
    const save = f.executeRaw.mock.calls.map((c) => c[0] as { values: unknown[] }).find((q) => /UPDATE calendar_settings SET digest_to/.test(sqlOf(q)))!;
    expect(save.values).toContain("paul@pmi.com");
  });

  it("claims a day's send once (atomic), and can release it after a failed send", async () => {
    const f = fake([[/UPDATE calendar_settings SET digest_last_sent/, [{ id: 1 }]]]);
    expect(await claimDigestSend(f.prisma, "2026-11-18")).toBe(true);
    const claim = f.queryRaw.mock.calls.find((c) => /digest_last_sent/.test(sqlOf(c[0])))![0];
    expect(sqlOf(claim)).toMatch(/digest_last_sent IS NULL OR digest_last_sent < /);
    const g = fake([[/UPDATE calendar_settings SET digest_last_sent/, []]]);
    expect(await claimDigestSend(g.prisma, "2026-11-18")).toBe(false);
    await releaseDigestSend(g.prisma, "2026-11-18");
    expect(sqlOf(g.executeRaw.mock.calls.at(-1)![0])).toMatch(/SET digest_last_sent = NULL WHERE id = 1 AND digest_last_sent = /);
  });
});
