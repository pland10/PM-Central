import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { routeQueries, sqlOf } from "../helpers/sql";
import {
  adoptCreatedWorkOrder,
  createdToRow,
  pendingNumber,
  pendingWoId,
  recordCreatedWorkOrder,
  resolveWorkOrderId,
  splitCreated,
  type CreatedWorkOrder,
} from "@/lib/created-work-orders";

afterEach(() => vi.clearAllMocks());

const created = (over: Partial<CreatedWorkOrder> = {}): CreatedWorkOrder => ({
  number: "100412",
  rvId: "412",
  propertyExternalId: "pmilighthouse:property:48",
  propertyLabel: "66 Francis Court, Elmont, NY 11003",
  unitId: null,
  priority: "High",
  description: "Kitchen sink leaking\nunder the cabinet",
  createdBy: "meg@pmi.com",
  createdAt: "2026-11-14T15:00:00.000Z",
  ...over,
});

function fakePrisma(queries: [RegExp, unknown[]][] = []) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn(routeQueries(queries));
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops));
  const prisma = {
    $executeRaw: executeRaw,
    $executeRawUnsafe: executeRawUnsafe,
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaClient;
  return { prisma, executeRaw, executeRawUnsafe, queryRaw, transaction };
}
const sqls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => sqlOf(c[0]));

describe("pending ids", () => {
  it("namespaces a just-created work order's id by its Rentvine number", () => {
    expect(pendingWoId("100412")).toBe("pmc:100412");
    expect(pendingNumber("pmc:100412")).toBe("100412");
    expect(pendingNumber("ls-abc")).toBeNull();
    expect(pendingNumber("pmc:")).toBeNull();
  });
});

describe("recordCreatedWorkOrder", () => {
  it("creates the table if needed and inserts once per Rentvine number", async () => {
    const { prisma, executeRaw, executeRawUnsafe } = fakePrisma();
    await recordCreatedWorkOrder(prisma, created());
    expect(executeRawUnsafe.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS pm_created_work_orders/);
    const q = executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlOf(q)).toMatch(/INSERT INTO pm_created_work_orders/);
    expect(sqlOf(q)).toMatch(/ON CONFLICT \(wo_number\) DO NOTHING/);
    expect(q.values).toEqual(expect.arrayContaining(["100412", "412", "pmilighthouse:property:48", "High", "meg@pmi.com"]));
  });
});

describe("splitCreated", () => {
  it("keeps the ones LeadSimple doesn't have yet, and pairs the arrived ones with their LeadSimple id", () => {
    const out = splitCreated([created({ number: "1" }), created({ number: "2" })], new Map([["2", "ls-2"]]));
    expect(out.pending.map((c) => c.number)).toEqual(["1"]);
    expect(out.arrived).toEqual([{ number: "2", lsId: "ls-2" }]);
  });
});

describe("createdToRow", () => {
  it("shows it like a new LeadSimple work order, marked pending", () => {
    const row = createdToRow(created(), { propertyId: "prop-48" });
    expect(row).toMatchObject({
      id: "pmc:100412",
      number: "100412",
      issue: "Kitchen sink leaking",
      stage: "New WO",
      terminal: false,
      property: "66 Francis Court, Elmont, NY 11003",
      priority: "High",
      propertyId: "prop-48",
      link: "",
      createdAt: "2026-11-14T15:00:00.000Z",
      pending: true,
    });
  });

  it("prefers Rentvine's priority once the Rentvine sync has it", () => {
    expect(createdToRow(created(), { propertyId: null, priority: "Low" }).priority).toBe("Low");
  });

  it("caps a long description for the issue line", () => {
    expect(createdToRow(created({ description: "x".repeat(300) }), { propertyId: null }).issue.length).toBeLessThanOrEqual(140);
  });
});

describe("adoptCreatedWorkOrder", () => {
  it("moves notes and the tech onto the LeadSimple row, then drops the stand-in, in one transaction", async () => {
    const { prisma, executeRaw, transaction } = fakePrisma([[/to_regclass/, [{ notes: true, techs: true }]]]);
    await adoptCreatedWorkOrder(prisma, "100412", "ls-9");

    expect(transaction).toHaveBeenCalledTimes(1);
    const run = sqls(executeRaw);
    expect(run[0]).toMatch(/UPDATE work_order_notes SET wo_id = /);
    expect(run[1]).toMatch(/INSERT INTO work_order_techs .* SELECT .* FROM work_order_techs WHERE wo_id = .* ON CONFLICT \(wo_id\) DO NOTHING/s);
    expect(run[2]).toMatch(/DELETE FROM work_order_techs WHERE wo_id = /);
    expect(run[3]).toMatch(/DELETE FROM pm_created_work_orders WHERE wo_number = /);
    const notesQ = executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(notesQ.values).toEqual(["ls-9", "pmc:100412"]);
  });

  it("skips the notes / tech moves when those tables don't exist yet", async () => {
    const { prisma, executeRaw } = fakePrisma([[/to_regclass/, [{ notes: false, techs: false }]]]);
    await adoptCreatedWorkOrder(prisma, "100412", "ls-9");
    expect(sqls(executeRaw)).toEqual([expect.stringMatching(/DELETE FROM pm_created_work_orders/)]);
  });
});

describe("resolveWorkOrderId", () => {
  it("passes a LeadSimple id through when that work order exists", async () => {
    const { prisma } = fakePrisma([[/FROM work_orders WHERE source_id/, [{ n: 1 }]]]);
    expect(await resolveWorkOrderId(prisma, "ls-1")).toBe("ls-1");
    const { prisma: none } = fakePrisma([[/FROM work_orders WHERE source_id/, [{ n: 0 }]]]);
    expect(await resolveWorkOrderId(none, "ls-1")).toBeNull();
  });

  it("keeps the stand-in id while LeadSimple doesn't have it yet", async () => {
    const { prisma } = fakePrisma([
      [/FROM work_orders WHERE wo_number/, []],
      [/FROM pm_created_work_orders/, [{ n: 1 }]],
    ]);
    expect(await resolveWorkOrderId(prisma, "pmc:100412")).toBe("pmc:100412");
  });

  it("switches to the LeadSimple row once it's there, bringing the edits along", async () => {
    const { prisma, executeRaw } = fakePrisma([
      [/FROM work_orders WHERE wo_number/, [{ source_id: "ls-9" }]],
      [/to_regclass/, [{ notes: true, techs: true }]],
    ]);
    expect(await resolveWorkOrderId(prisma, "pmc:100412")).toBe("ls-9");
    expect(sqls(executeRaw).some((s) => /UPDATE work_order_notes/.test(s))).toBe(true);
  });

  it("returns null for an unknown stand-in", async () => {
    const { prisma } = fakePrisma([
      [/FROM work_orders WHERE wo_number/, []],
      [/FROM pm_created_work_orders/, [{ n: 0 }]],
    ]);
    expect(await resolveWorkOrderId(prisma, "pmc:999")).toBeNull();
  });
});
