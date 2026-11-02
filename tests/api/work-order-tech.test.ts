import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn() },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { POST } from "@/app/api/work-orders/tech/route";

const executeRaw = vi.mocked(prisma.$executeRaw);
const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/work-orders/tech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const writes = (re: RegExp) => executeRaw.mock.calls.filter((c) => re.test(sqlOf(c[0])));

beforeEach(() => {
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  executeRaw.mockResolvedValue(1);
  vi.mocked(prisma.$queryRaw).mockImplementation(routeQueries([[/FROM work_orders WHERE source_id/, [{ n: 1 }]]]) as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", name: "Paul Landman", role: "admin" } as never);
  vi.mocked(listStaff).mockResolvedValue([
    { name: "Ari Cohen", email: "ari@pmi.com" },
    { name: "Paul Landman", email: "paul@pmi.com" },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/work-orders/tech", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post({ woId: "abc", techEmail: "ari@pmi.com" })).status).toBe(401);
  });

  it("assigns a PM-Central user as the tech, recording who assigned it", async () => {
    const res = await post({ woId: "abc", techEmail: "ARI@pmi.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tech: { name: "Ari Cohen", email: "ari@pmi.com" } });
    const up = writes(/INSERT INTO work_order_techs/)[0][0] as { sql: string; values: unknown[] };
    expect(sqlOf(up)).toMatch(/ON CONFLICT \(wo_id\) DO UPDATE/);
    expect(up.values).toEqual(["abc", "ari@pmi.com", "Ari Cohen", "paul@pmi.com"]);
  });

  it("unassigns", async () => {
    const res = await post({ woId: "abc", techEmail: null });
    expect(await res.json()).toEqual({ ok: true, tech: null });
    expect((writes(/DELETE FROM work_order_techs/)[0][0] as { values: unknown[] }).values).toEqual(["abc"]);
  });

  it("only accepts PM-Central users and existing work orders", async () => {
    expect((await post({ woId: "abc", techEmail: "random@example.com" })).status).toBe(400);
    vi.mocked(prisma.$queryRaw).mockImplementation(routeQueries([[/FROM work_orders WHERE source_id/, [{ n: 0 }]]]) as never);
    expect((await post({ woId: "nope", techEmail: "ari@pmi.com" })).status).toBe(404);
    expect(writes(/work_order_techs/)).toHaveLength(0);
  });
});
