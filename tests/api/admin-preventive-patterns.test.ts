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
import { DELETE, GET, POST } from "@/app/api/admin/preventive-patterns/route";

const queryRaw = vi.mocked(prisma.$queryRaw);
const executeRaw = vi.mocked(prisma.$executeRaw);
const URL = "https://pmilighthouse.app/api/admin/preventive-patterns";
const post = (body: unknown) =>
  POST(new NextRequest(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  executeRaw.mockResolvedValue(1);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("/api/admin/preventive-patterns", () => {
  it("is admins only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@pmi.com", role: "user" } as never);
    expect((await GET()).status).toBe(403);
    expect((await post({ pattern: "gutter cleaning" })).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("lists the keyword rules", async () => {
    queryRaw.mockResolvedValueOnce([
      { id: 1, pattern: "gutter cleaning", note: "seasonal", created_by: "admin@pmi.com", created_at: new Date("2026-11-09T12:00:00Z") },
    ]);
    const res = await GET();
    expect(await res.json()).toEqual({
      patterns: [
        { id: 1, pattern: "gutter cleaning", note: "seasonal", createdBy: "admin@pmi.com", createdAt: "2026-11-09T12:00:00.000Z" },
      ],
    });
  });

  it("adds a keyword (idempotently), normalized, recording who added it", async () => {
    const res = await post({ pattern: "  Gutter   Cleaning ", note: " seasonal " });
    expect(res.status).toBe(201);
    const insert = executeRaw.mock.calls.find((c) => /INSERT INTO preventive_patterns/.test(sqlOf(c[0])))!;
    expect(sqlOf(insert[0])).toMatch(/ON CONFLICT \(pattern\) DO NOTHING/);
    expect((insert[0] as { values: unknown[] }).values).toEqual(["Gutter Cleaning", "seasonal", "admin@pmi.com"]);
  });

  it("allows an empty note", async () => {
    const res = await post({ pattern: "winterize" });
    expect(res.status).toBe(201);
    const insert = executeRaw.mock.calls.find((c) => /INSERT INTO preventive_patterns/.test(sqlOf(c[0])))!;
    expect((insert[0] as { values: unknown[] }).values).toEqual(["winterize", "", "admin@pmi.com"]);
  });

  it("rejects an empty keyword", async () => {
    const res = await post({ pattern: "   " });
    expect(res.status).toBe(400);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("deletes a keyword by id", async () => {
    const res = await DELETE(new NextRequest(`${URL}?id=3`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    const del = executeRaw.mock.calls.find((c) => /DELETE FROM preventive_patterns/.test(sqlOf(c[0])))!;
    expect((del[0] as { values: unknown[] }).values).toEqual([3]);
  });

  it("rejects a bad id", async () => {
    expect((await DELETE(new NextRequest(`${URL}?id=abc`, { method: "DELETE" }))).status).toBe(400);
  });
});
