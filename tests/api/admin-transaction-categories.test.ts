import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $transaction: vi.fn() },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { DELETE, GET, PATCH, POST } from "@/app/api/admin/transaction-categories/route";
import { POST as MERGE } from "@/app/api/admin/transaction-categories/merge/route";

const executeRaw = vi.mocked(prisma.$executeRaw);
const queryRaw = vi.mocked(prisma.$queryRaw);
const URL = "https://pmilighthouse.app/api/admin/transaction-categories";
const req = (method: string, body?: unknown, url = URL) =>
  new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const writes = (re: RegExp) => executeRaw.mock.calls.filter((c) => re.test(sqlOf(c[0])));

beforeEach(() => {
  executeRaw.mockResolvedValue(1);
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  vi.mocked(prisma.$transaction).mockImplementation((async (ops: unknown[]) => Promise.all(ops)) as never);
  queryRaw.mockImplementation(
    routeQueries([
      [/FROM transaction_category_settings/, [{ open: true }]],
      [/COUNT\(t\.transaction_id\)/, [{ name: "Payroll", n: 10 }, { name: "pay roll", n: 2 }, { name: "Unused", n: 0 }]],
    ]) as never
  );
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("/api/admin/transaction-categories", () => {
  it("is admins only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@pmi.com", role: "user" } as never);
    expect((await GET()).status).toBe(403);
    expect((await MERGE(req("POST", { from: "pay roll", to: "Payroll" }))).status).toBe(403);
    expect(writes(/UPDATE|DELETE|INSERT/)).toHaveLength(0);
  });

  it("lists categories with usage counts and whether the list is open", async () => {
    const body = await (await GET()).json();
    expect(body.open).toBe(true);
    expect(body.categories).toEqual([
      { name: "Payroll", count: 10 },
      { name: "pay roll", count: 2 },
      { name: "Unused", count: 0 },
    ]);
  });

  it("adds a category", async () => {
    expect((await POST(req("POST", { name: " Utilities " }))).status).toBe(201);
    const ins = writes(/INSERT INTO transaction_categories/).at(-1)!;
    expect((ins[0] as { values: unknown[] }).values).toEqual(["Utilities", "admin@pmi.com"]);
  });

  it("opens or locks the list", async () => {
    expect((await PATCH(req("PATCH", { open: false }))).status).toBe(200);
    const upd = writes(/transaction_category_settings/).at(-1)!;
    expect((upd[0] as { values: unknown[] }).values).toContain(false);
  });

  it("merges one category into another: moves its transactions and removes it", async () => {
    const res = await MERGE(req("POST", { from: "pay roll", to: "Payroll" }));
    expect(res.status).toBe(200);
    const move = writes(/UPDATE plaid_transactions SET category_override/)[0][0] as { values: unknown[] };
    expect(move.values).toEqual(["Payroll", "pay roll"]);
    const del = writes(/DELETE FROM transaction_categories/)[0][0] as { values: unknown[] };
    expect(del.values).toEqual(["pay roll"]);
  });

  it("won't merge a category into itself", async () => {
    expect((await MERGE(req("POST", { from: "Payroll", to: "payroll" }))).status).toBe(400);
  });

  it("deletes only unused categories", async () => {
    expect((await DELETE(req("DELETE", undefined, `${URL}?name=Unused`))).status).toBe(200);
    expect((await DELETE(req("DELETE", undefined, `${URL}?name=Payroll`))).status).toBe(409);
    expect(writes(/DELETE FROM transaction_categories/)).toHaveLength(1);
  });
});
