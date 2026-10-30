import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { sqlOf } from "../helpers/sql";
import { saveRentvineUnits } from "@/lib/rentvine-units";

const prisma = {
  $executeRaw: vi.fn().mockResolvedValue(1),
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
};
const db = prisma as unknown as PrismaClient;
afterEach(() => vi.clearAllMocks());

const units = [
  { unitId: "45", propertyExternalId: "48", name: "Unit 1", active: true },
  { unitId: "46", propertyExternalId: "48", name: "Unit 2", active: false },
];

describe("saveRentvineUnits", () => {
  it("creates the table, upserts every unit and drops ones Rentvine no longer has", async () => {
    expect(await saveRentvineUnits(db, units)).toBe(2);

    expect(sqlOf(prisma.$executeRawUnsafe.mock.calls[0][0])).toMatch(/CREATE TABLE IF NOT EXISTS rentvine_units/);
    const sqls = prisma.$executeRaw.mock.calls.map((c) => c[0] as { sql: string; values: unknown[] });
    const upsert = sqls.find((q) => /INSERT INTO rentvine_units/.test(q.sql))!;
    expect(upsert.sql).toMatch(/ON CONFLICT \(unit_id\) DO UPDATE/);
    expect(upsert.values).toEqual(["45", "48", "Unit 1", true, "46", "48", "Unit 2", false]);
    const del = sqls.find((q) => /DELETE FROM rentvine_units/.test(q.sql))!;
    expect(del.values).toEqual(["45", "46"]);
  });

  it("never wipes the table when Rentvine returns nothing", async () => {
    expect(await saveRentvineUnits(db, [])).toBe(0);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
