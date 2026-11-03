import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { inspectorReceipt: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/invoicing/receipts/route";
import { PATCH, DELETE } from "@/app/api/invoicing/receipts/[id]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/invoicing/receipts", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "r1" }) };
const create = vi.mocked(prisma.inspectorReceipt.create);

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "meg@pmi.com", role: "user" } as never);
  vi.mocked(prisma.inspectorReceipt.findMany).mockResolvedValue([{ number: "PMI-R-0008" }] as never);
  create.mockImplementation((async (a: { data: { number: string } }) => ({ id: "new", number: a.data.number })) as never);
  vi.mocked(prisma.inspectorReceipt.update).mockResolvedValue({ id: "r1" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("receipts API", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req("POST", { billing_party: "pmi" }))).status).toBe(401);
  });

  it("creates the next numbered receipt for the party", async () => {
    const res = await POST(req("POST", { billing_party: "pmi" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new" });
    expect(create.mock.calls[0][0].data).toMatchObject({ number: "PMI-R-0009", billingParty: "pmi", inspector: "" });
  });

  it("takes the next number if one was claimed meanwhile", async () => {
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    await POST(req("POST", { billing_party: "pmi" }));
    expect(create.mock.calls[1][0].data).toMatchObject({ number: "PMI-R-0010" });
  });

  it("saves an edit and rejects a bad one", async () => {
    const good = { inspector: "Ari", paidOn: "2026-11-03", items: [{ property: "6 Harbor Ln", at: "2026-11-01", amount: "45" }] };
    expect((await PATCH(req("PATCH", good), ctx)).status).toBe(200);
    expect(vi.mocked(prisma.inspectorReceipt.update).mock.calls[0][0]).toMatchObject({
      where: { id: "r1" },
      data: { inspector: "Ari", items: [{ property: "6 Harbor Ln", at: "2026-11-01", amount: 45 }] },
    });
    expect((await PATCH(req("PATCH", { ...good, paidOn: "nope" }), ctx)).status).toBe(400);
  });

  it("only admins can delete, and it's a soft delete", async () => {
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", role: "admin" } as never);
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(200);
    const call = vi.mocked(prisma.inspectorReceipt.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "r1" });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });
});
