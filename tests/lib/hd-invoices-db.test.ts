import { describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";
import { upsertHdInvoices } from "@/lib/hd-invoices-db";

function fakePrisma(returned: { inserted: boolean }[]) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue(returned),
  };
}

const rows = [
  { invoiceNumber: "5533628", date: "2026-11-07", po: "", amount: 20.62 },
  { invoiceNumber: "8513573", date: "2026-11-04", po: "FHOUSE", amount: 27.06 },
  { invoiceNumber: "8513573", date: "2026-11-04", po: "FHOUSE", amount: 27.06 }, // repeated line
];

describe("upsertHdInvoices", () => {
  it("upserts one row per invoice and counts new vs already imported", async () => {
    const prisma = fakePrisma([{ inserted: true }, { inserted: false }]);
    const res = await upsertHdInvoices(prisma as never, rows);
    expect(res).toEqual({ imported: 1, updated: 1 });

    const q = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    const sql = sqlOf(q);
    expect(sql).toMatch(/ON CONFLICT \(transaction_id\) DO UPDATE/);
    expect(sql.slice(sql.indexOf("DO UPDATE"))).not.toMatch(/reimbursable|notes|recorded_|property_external_id|archived/);
    // the repeated invoice is sent once
    expect(q.values.filter((v) => v === "hd:8513573")).toHaveLength(1);
    expect(q.values).toEqual(expect.arrayContaining(["Home Depot Pro", "Invoice 8513573 · PO FHOUSE"]));
  });

  it("does nothing for an empty list", async () => {
    const prisma = fakePrisma([]);
    expect(await upsertHdInvoices(prisma as never, [])).toEqual({ imported: 0, updated: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
