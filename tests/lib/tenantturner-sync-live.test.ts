import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../helpers/sql";
import { loadTtSince, pruneShowingsBefore, saveTtSince, upsertTtShowing } from "@/lib/tenantturner/sync-live";

afterEach(() => vi.clearAllMocks());

function fakePrisma(queries: [RegExp, unknown[]][] = [], properties: { id: string; street1: string }[] = []) {
  const executeRaw = vi.fn().mockResolvedValue(3);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(queries));
  const upsert = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue(properties);
  const prisma = {
    $executeRaw: executeRaw,
    $executeRawUnsafe: executeRawUnsafe,
    $queryRaw: queryRaw,
    showing: { upsert },
    property: { findMany },
  } as unknown as PrismaClient;
  return { prisma, executeRaw, executeRawUnsafe, queryRaw, upsert, findMany };
}

describe("checkpoint", () => {
  it("reads the last run's start point, or null the first time", async () => {
    const { prisma, executeRawUnsafe } = fakePrisma([[/FROM tenantturner_sync_state/, [{ since: new Date("2026-11-10T00:00:00Z") }]]]);
    expect(await loadTtSince(prisma)).toBe("2026-11-10T00:00:00.000Z");
    expect(executeRawUnsafe.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS tenantturner_sync_state/);
    const { prisma: empty } = fakePrisma([[/FROM tenantturner_sync_state/, []]]);
    expect(await loadTtSince(empty)).toBeNull();
  });

  it("saves it as the single row", async () => {
    const { prisma, executeRaw } = fakePrisma();
    await saveTtSince(prisma, "2026-11-18T21:50:00.000Z");
    const q = executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlOf(q)).toMatch(/INSERT INTO tenantturner_sync_state .* ON CONFLICT \(id\) DO UPDATE/s);
    expect(q.values).toContain("2026-11-18T21:50:00.000Z");
  });
});

describe("upsertTtShowing", () => {
  const input = {
    externalId: "9001",
    status: "confirmed",
    startTime: new Date("2026-11-05T15:00:00Z"),
    leadName: "Ann Lee",
    ttAddress: "66 Francis Ct.",
    ttZip: "11003-1234",
    ttPropertyId: "77",
  };

  it("upserts on (source, showingId) and links our property by street + zip", async () => {
    const { prisma, upsert, findMany } = fakePrisma([], [{ id: "prop-1", street1: "66 Francis Ct" }]);
    expect(await upsertTtShowing(prisma, input)).toEqual({ linked: true });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { zip: { startsWith: "11003" } } });
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ source_externalId: { source: "tenantturner", externalId: "9001" } });
    expect(arg.create).toMatchObject({ source: "tenantturner", externalId: "9001", status: "confirmed", leadName: "Ann Lee", propertyId: "prop-1", lastEventType: "api-sync" });
    expect(arg.update).toMatchObject({ status: "confirmed", propertyId: "prop-1" });
    expect(arg.update).not.toHaveProperty("externalId");
  });

  it("leaves out fields Tenant Turner didn't send, and never unlinks a property", async () => {
    const { prisma, upsert } = fakePrisma([], []);
    expect(await upsertTtShowing(prisma, input)).toEqual({ linked: false });
    const { update } = upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("propertyId");
    expect(update).not.toHaveProperty("leadEmail");
  });
});

describe("pruneShowingsBefore", () => {
  it("deletes only Tenant Turner showings created before the date", async () => {
    const { prisma, executeRaw } = fakePrisma();
    expect(await pruneShowingsBefore(prisma, "2026-11-01")).toBe(3);
    const q = executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlOf(q)).toMatch(/DELETE FROM "Showing" WHERE source = .* AND "createdAt" < /);
    expect(q.values).toEqual(["tenantturner", "2026-11-01"]);
  });
});
