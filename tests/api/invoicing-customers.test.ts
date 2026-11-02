import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { invoiceCustomer: { create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/invoicing/customers/route";
import { PATCH, DELETE } from "@/app/api/invoicing/customers/[id]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/invoicing/customers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", role: "admin" } as never);
  vi.mocked(prisma.invoiceCustomer.create).mockResolvedValue({ id: "c1" } as never);
  vi.mocked(prisma.invoiceCustomer.update).mockResolvedValue({ id: "c1" } as never);
  vi.mocked(prisma.invoiceCustomer.delete).mockResolvedValue({ id: "c1" } as never);
});
afterEach(() => vi.clearAllMocks());

const valid = {
  name: " Smith Trust ",
  billingParty: "pmi",
  service: "Squatter watch",
  rate: "250.50",
  frequency: "monthly",
  startDate: "2026-11-01",
  isActive: true,
};

describe("customers API", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req("POST", valid))).status).toBe(401);
  });

  it("creates a customer, trimming text and parsing the rate", async () => {
    const res = await POST(req("POST", valid));
    expect(res.status).toBe(201);
    expect(vi.mocked(prisma.invoiceCustomer.create).mock.calls[0][0].data).toMatchObject({
      name: "Smith Trust",
      billingParty: "pmi",
      rate: 250.5,
      frequency: "monthly",
      startDate: "2026-11-01",
      isActive: true,
    });
  });

  it("rejects a missing name, unknown frequency or party, bad start date or negative rate", async () => {
    for (const bad of [
      { ...valid, name: "  " },
      { ...valid, frequency: "weekly" },
      { ...valid, billingParty: "acme" },
      { ...valid, startDate: "11/01/2026" },
      { ...valid, rate: "-5" },
    ]) {
      expect((await POST(req("POST", bad))).status).toBe(400);
    }
    expect(prisma.invoiceCustomer.create).not.toHaveBeenCalled();
  });

  it("updates and deletes by id", async () => {
    expect((await PATCH(req("PATCH", { ...valid, isActive: false }), ctx)).status).toBe(200);
    expect(vi.mocked(prisma.invoiceCustomer.update).mock.calls[0][0]).toMatchObject({ where: { id: "c1" }, data: { isActive: false } });
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(200);
    expect(prisma.invoiceCustomer.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
