import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { PUT } from "@/app/api/invoices/[id]/route";

const inv = vi.mocked(prisma.invoice);
const put = (body: unknown, id = "inv60") =>
  PUT(
    new NextRequest(`https://pmilighthouse.app/api/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

const LOADED = "2026-11-26T15:00:00.000Z";
const NEWER = "2026-11-26T15:05:00.000Z";
const items = [{ desc: "Monthly Squatter Watch Service", qty: 1, rate: 150 }];

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@pmi.com", role: "admin" } as never);
});
afterEach(() => vi.clearAllMocks());

describe("PUT /api/invoices/:id — never overwrite a newer save with a stale copy", () => {
  it("saves when the editor's version is current, and returns the new version", async () => {
    inv.updateMany.mockResolvedValue({ count: 1 } as never);
    inv.findUnique.mockResolvedValue({ updatedAt: new Date(NEWER) } as never);
    const res = await put({ items, base_updated_at: LOADED });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "inv60", updated_at: NEWER });
    const arg = inv.updateMany.mock.calls[0][0] as { where: { id: string; updatedAt: Date } };
    expect(arg.where).toEqual({ id: "inv60", updatedAt: new Date(LOADED) });
  });

  it("refuses (409) when the invoice changed since the editor loaded it — nothing is written", async () => {
    inv.updateMany.mockResolvedValue({ count: 0 } as never);
    inv.findUnique.mockResolvedValue({ updatedAt: new Date(NEWER) } as never);
    const res = await put({ items, base_updated_at: LOADED });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ conflict: true });
    expect(inv.update).not.toHaveBeenCalled();
  });

  it("404s when the invoice is gone", async () => {
    inv.updateMany.mockResolvedValue({ count: 0 } as never);
    inv.findUnique.mockResolvedValue(null as never);
    expect((await put({ items, base_updated_at: LOADED })).status).toBe(404);
  });

  it("without a version (other callers) it updates as before", async () => {
    inv.update.mockResolvedValue({ updatedAt: new Date(NEWER) } as never);
    const res = await put({ status: "sent" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "inv60", updated_at: NEWER });
    expect(inv.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed version", async () => {
    expect((await put({ items, base_updated_at: "yesterday" })).status).toBe(400);
  });
});
