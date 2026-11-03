import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { watchedProperty: { create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/invoicing/watched/route";
import { PATCH, DELETE } from "@/app/api/invoicing/watched/[id]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/invoicing/watched", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "w1" }) };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "meg@pmi.com", role: "user" } as never);
  vi.mocked(prisma.watchedProperty.create).mockResolvedValue({ id: "w1" } as never);
  vi.mocked(prisma.watchedProperty.update).mockResolvedValue({ id: "w1" } as never);
  vi.mocked(prisma.watchedProperty.delete).mockResolvedValue({ id: "w1" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("watched properties API", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req("POST", { address: "x" }))).status).toBe(401);
  });

  it("adds a Rentvine property or a typed address", async () => {
    expect((await POST(req("POST", { address: "6 Harbor Ln, Glen Head, NY 11545", label: "Katerina Stella", rentvinePropertyId: "70" }))).status).toBe(201);
    expect(vi.mocked(prisma.watchedProperty.create).mock.calls[0][0].data).toEqual({
      address: "6 Harbor Ln, Glen Head, NY 11545", label: "Katerina Stella", source: "property", rentvinePropertyId: "70",
    });
    await POST(req("POST", { address: " 12 Elm St " }));
    expect(vi.mocked(prisma.watchedProperty.create).mock.calls[1][0].data).toEqual({
      address: "12 Elm St", label: null, source: "manual", rentvinePropertyId: null,
    });
  });

  it("rejects a blank address and reports a duplicate", async () => {
    expect((await POST(req("POST", { address: "  " }))).status).toBe(400);
    vi.mocked(prisma.watchedProperty.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" })
    );
    expect((await POST(req("POST", { address: "x", rentvinePropertyId: "70" }))).status).toBe(409);
  });

  it("takes a property out of the programme and back, and deletes", async () => {
    expect((await PATCH(req("PATCH", { isActive: false }), ctx)).status).toBe(200);
    expect(vi.mocked(prisma.watchedProperty.update).mock.calls[0][0]).toEqual({ where: { id: "w1" }, data: { isActive: false } });
    expect((await PATCH(req("PATCH", {}), ctx)).status).toBe(400);
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(200);
  });
});
