import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { property: { findFirst: vi.fn() } } }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rentvine-units", () => ({ unitBelongsToProperty: vi.fn() }));
vi.mock("@/lib/inspections/rentvine-wo", () => ({ createRentvineWorkOrder: vi.fn(), isRentvineConfigured: vi.fn(() => true) }));
vi.mock("@/lib/created-work-orders", () => ({ recordCreatedWorkOrder: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { unitBelongsToProperty } from "@/lib/rentvine-units";
import { createRentvineWorkOrder, isRentvineConfigured } from "@/lib/inspections/rentvine-wo";
import { recordCreatedWorkOrder } from "@/lib/created-work-orders";
import { POST } from "@/app/api/work-orders/create/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/work-orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const create = vi.mocked(createRentvineWorkOrder);
const good = { propertyId: "pmilighthouse:property:48", description: "  Kitchen sink leaking  " };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "meg@pmi.com", name: "Meg", role: "user" } as never);
  vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "p1" } as never);
  vi.mocked(unitBelongsToProperty).mockResolvedValue(true);
  create.mockResolvedValue({ ok: true, ref: "100412", id: "412" });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/work-orders/create", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post(good)).status).toBe(401);
  });

  it("creates the work order in Rentvine on the property, Medium priority by default", async () => {
    const res = await post(good);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      number: "100412",
      url: "https://pmilighthouse.rentvine.com/maintenance/work-orders/412",
    });
    expect(create).toHaveBeenCalledWith({ propertyId: "48", unitId: null, description: "Kitchen sink leaking", priorityId: 2 });
  });

  it("passes a unit and priority when given", async () => {
    await post({ ...good, unitId: "46", priority: "High" });
    expect(unitBelongsToProperty).toHaveBeenCalledWith(prisma, "46", "pmilighthouse:property:48");
    expect(create).toHaveBeenCalledWith({ propertyId: "48", unitId: "46", description: "Kitchen sink leaking", priorityId: 3 });
  });

  it("needs a known property and a description", async () => {
    expect((await post({ ...good, description: "  " })).status).toBe(400);
    vi.mocked(prisma.property.findFirst).mockResolvedValueOnce(null);
    expect((await post(good)).status).toBe(400);
    vi.mocked(unitBelongsToProperty).mockResolvedValueOnce(false);
    expect((await post({ ...good, unitId: "99" })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes Rentvine's refusal back, and says when Rentvine isn't configured", async () => {
    create.mockResolvedValueOnce({ ok: false, status: 422, error: "Rentvine rejected the work order (HTTP 422). bad" });
    const res = await post(good);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/HTTP 422/);
    vi.mocked(isRentvineConfigured).mockReturnValueOnce(false);
    expect((await post(good)).status).toBe(503);
  });
});

describe("POST /api/work-orders/create — shows on the list right away", () => {
  const record = vi.mocked(recordCreatedWorkOrder);
  const addr = { id: "p1", street1: "8204 138th Street", street2: null, city: "Jamaica", state: "NY", zip: "11435" };

  it("records the work order once Rentvine returns its number", async () => {
    vi.mocked(prisma.property.findFirst).mockResolvedValue(addr as never);
    create.mockResolvedValue({ ok: true, ref: "100412", id: "412", number: "100412" });
    const res = await post({ ...good, unitId: "46", priority: "High" });
    expect(res.status).toBe(201);
    expect(record).toHaveBeenCalledWith(prisma, {
      number: "100412",
      rvId: "412",
      propertyExternalId: "pmilighthouse:property:48",
      propertyLabel: "8204 138th Street, Jamaica, NY 11435",
      unitId: "46",
      priority: "High",
      description: "Kitchen sink leaking",
      createdBy: "meg@pmi.com",
    });
  });

  it("doesn't record it when Rentvine didn't give a work-order number", async () => {
    create.mockResolvedValue({ ok: true, ref: "412", id: "412", number: "" });
    expect((await post(good)).status).toBe(201);
    expect(record).not.toHaveBeenCalled();
  });

  it("still reports success when recording fails (the work order is in Rentvine)", async () => {
    vi.mocked(prisma.property.findFirst).mockResolvedValue(addr as never);
    create.mockResolvedValue({ ok: true, ref: "100412", id: "412", number: "100412" });
    record.mockRejectedValueOnce(new Error("db down"));
    const res = await post(good);
    expect(res.status).toBe(201);
    expect((await res.json()).number).toBe("100412");
  });
});
