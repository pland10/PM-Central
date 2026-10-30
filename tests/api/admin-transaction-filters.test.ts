import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { DELETE, GET, PATCH, POST } from "@/app/api/admin/transaction-filters/route";

const queryRaw = vi.mocked(prisma.$queryRaw);
const executeRaw = vi.mocked(prisma.$executeRaw);
const URL = "https://pmilighthouse.app/api/admin/transaction-filters";
const post = (body: unknown) =>
  POST(new NextRequest(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  executeRaw.mockResolvedValue(1);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("/api/admin/transaction-filters", () => {
  it("is admins only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@pmi.com", role: "user" } as never);
    expect((await GET()).status).toBe(403);
    expect((await post({ pattern: "*CSG FORTE*" })).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("lists the hide rules", async () => {
    queryRaw.mockResolvedValueOnce([
      { id: 1, pattern: "*CSG FORTE*", comment: "Rentvine ACH fees", created_by: "admin@pmi.com", created_at: new Date("2026-10-30T12:00:00Z") },
    ]);
    const res = await GET();
    expect(await res.json()).toEqual({
      rules: [
        { id: 1, pattern: "*CSG FORTE*", comment: "Rentvine ACH fees", createdBy: "admin@pmi.com", createdAt: "2026-10-30T12:00:00.000Z" },
      ],
    });
  });

  it("adds a rule with its comment (idempotently) and records who added it", async () => {
    const res = await post({ pattern: "  *CSG FORTE* ", comment: " Rentvine ACH fees " });
    expect(res.status).toBe(201);
    const insert = executeRaw.mock.calls.find((c) => /INSERT INTO transaction_hide_rules/.test(sqlOf(c[0])))!;
    expect(sqlOf(insert[0])).toMatch(/ON CONFLICT \(pattern\) DO NOTHING/);
    expect((insert[0] as { values: unknown[] }).values).toEqual(["*CSG FORTE*", "Rentvine ACH fees", "admin@pmi.com"]);
  });

  it("requires a comment saying why the rule exists", async () => {
    const res = await post({ pattern: "*CSG FORTE*", comment: "  " });
    expect(res.status).toBe(400);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("updates a rule's comment", async () => {
    const res = await PATCH(
      new NextRequest(`${URL}?id=3`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Card processing fees" }),
      })
    );
    expect(res.status).toBe(200);
    const upd = executeRaw.mock.calls.find((c) => /UPDATE transaction_hide_rules/.test(sqlOf(c[0])))!;
    expect((upd[0] as { values: unknown[] }).values).toEqual(["Card processing fees", 3]);
  });

  it("rejects a pattern that would hide everything", async () => {
    const res = await post({ pattern: "*", comment: "oops" });
    expect(res.status).toBe(400);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("deletes a rule by id", async () => {
    const res = await DELETE(new NextRequest(`${URL}?id=3`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    const del = executeRaw.mock.calls.find((c) => /DELETE FROM transaction_hide_rules/.test(sqlOf(c[0])))!;
    expect((del[0] as { values: unknown[] }).values).toEqual([3]);
  });

  it("rejects a bad id", async () => {
    expect((await DELETE(new NextRequest(`${URL}?id=abc`, { method: "DELETE" }))).status).toBe(400);
  });
});
