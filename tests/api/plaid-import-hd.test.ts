import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $queryRaw: vi.fn() },
}));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/plaid/import-hd/route";

const queryRaw = vi.mocked(prisma.$queryRaw);
const CSV = `Invoices by Statement Date
Invoice Date,Invoice Number,Purchase Order,Amount Due
Nov 07 2026,5533628,,$20.62
Nov 07 2026,5134066,NA,$-6.51
Nov 04 2026,8513573,FHOUSE,$27.06
`;

const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/plaid/import-hd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0);
  // two new, one already imported (updated)
  queryRaw.mockResolvedValue([{ inserted: true }, { inserted: false }, { inserted: true }] as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/plaid/import-hd", () => {
  it("upserts each invoice as its own Home Depot Pro transaction and reports new vs updated", async () => {
    const res = await post({ csv: CSV });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, imported: 2, updated: 1, errors: [] });

    const q = queryRaw.mock.calls[0][0] as { values: unknown[] };
    const sql = sqlOf(q);
    expect(sql).toMatch(/INSERT INTO plaid_transactions/);
    expect(sql).toMatch(/ON CONFLICT \(transaction_id\) DO UPDATE/);
    expect(sql).toMatch(/RETURNING \(xmax = 0\) AS inserted/);
    // a re-import refreshes the invoice's own fields but never the team's edits
    const update = sql.slice(sql.indexOf("DO UPDATE"));
    expect(update).not.toMatch(/reimbursable|notes|recorded_|property_external_id|archived/);
    expect(q.values).toEqual(expect.arrayContaining(["hd:5533628", "hd:5134066", "hd:8513573", "Home Depot Pro", -6.51, "2026-11-04"]));
    expect(q.values).toEqual(expect.arrayContaining(["Invoice 8513573 · PO FHOUSE", "Invoice 5533628"]));
  });

  it("400s on a file that isn't the Home Depot export, or with no invoices in it", async () => {
    expect((await post({ csv: "Date,Description,Amount\n2026-11-01,Coffee,4\n" })).status).toBe(400);
    expect((await post({ csv: "Invoice Date,Invoice Number,Purchase Order,Amount Due\n" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("refuses an oversized upload", async () => {
    expect((await post({ csv: "x".repeat(2_000_001) })).status).toBe(413);
  });

  it("404s for a user without accounting access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@y.com", role: "user" } as never);
    expect((await post({ csv: CSV })).status).toBe(404);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
