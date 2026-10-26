import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { inspectProperty: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/inspections/db", () => ({
  getInspectionDetail: vi.fn(),
  setResolution: vi.fn(),
  clearResolution: vi.fn(),
}));
vi.mock("@/lib/inspections/rentvine-wo", () => ({
  createRentvineWorkOrder: vi.fn(),
  isRentvineConfigured: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { clearResolution, getInspectionDetail, setResolution } from "@/lib/inspections/db";
import { createRentvineWorkOrder, isRentvineConfigured } from "@/lib/inspections/rentvine-wo";
import { POST } from "@/app/api/inspections/[id]/resolve/route";
import { check, inspection, property } from "../lib/inspections/fixtures";

const resolve = (body: unknown, id = "1") =>
  POST(new NextRequest("https://pmilighthouse.app/api/inspections/1/resolve", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

const detail = (over = {}) => ({
  inspection: inspection({ overall_status: "Needs attention" }),
  property,
  checklist: [check({ item_label: "Water / Leaks", status: "Issue found", issue_notes: "Drip" })],
  photos: [],
  workItems: [],
  ...over,
});

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", role: "staff" } as never);
  vi.mocked(isRentvineConfigured).mockReturnValue(true);
  vi.mocked(getInspectionDetail).mockResolvedValue(detail() as never);
  vi.mocked(prisma.inspectProperty.findUnique).mockResolvedValue({ rv_id: "12" } as never);
  vi.mocked(createRentvineWorkOrder).mockResolvedValue({ ok: true, ref: "301", id: "812" });
});

describe("POST /api/inspections/[id]/resolve", () => {
  it("is unavailable when inspections are disabled, and requires a signed-in user", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await resolve({ action: "resolved" })).status).toBe(404);

    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await resolve({ action: "resolved" })).status).toBe(401);
  });

  it("rejects a non-numeric id and an unknown action", async () => {
    expect((await resolve({ action: "resolved" }, "abc")).status).toBe(400);
    expect((await resolve({ action: "delete-everything" })).status).toBe(400);
  });

  it("marks an inspection resolved with the note and user", async () => {
    const res = await resolve({ action: "resolved", note: "Plumber fixed it" });

    expect(await res.json()).toEqual({ ok: true, resolution: "resolved" });
    expect(setResolution).toHaveBeenCalledWith(1, "resolved", { note: "Plumber fixed it", userId: "user-1" });
  });

  it("reopens a resolved inspection", async () => {
    await resolve({ action: "reopen" });
    expect(clearResolution).toHaveBeenCalledWith(1);
  });

  describe("action: work_order", () => {
    it("creates a Rentvine work order from the inspection and stores its number", async () => {
      const res = await resolve({ action: "work_order", priorityId: 3, note: "urgent" });

      expect(await res.json()).toEqual({ ok: true, resolution: "work_order", workOrderRef: "301" });
      const call = vi.mocked(createRentvineWorkOrder).mock.calls[0][0];
      expect(call).toMatchObject({ propertyId: "12", priorityId: 3 });
      expect(call.description).toContain("Water / Leaks: Drip"); // built from the inspection
      expect(setResolution).toHaveBeenCalledWith(1, "work_order", { note: "urgent", userId: "user-1", workOrderRef: "301" });
    });

    it("uses an edited description when one is sent", async () => {
      await resolve({ action: "work_order", description: "  Replace the kitchen faucet  " });
      expect(vi.mocked(createRentvineWorkOrder).mock.calls[0][0]).toMatchObject({
        description: "Replace the kitchen faucet",
        priorityId: undefined,
      });
    });

    it.each([
      ["Rentvine isn't configured", () => vi.mocked(isRentvineConfigured).mockReturnValue(false), 503],
      ["the inspection doesn't exist", () => vi.mocked(getInspectionDetail).mockResolvedValue(null), 404],
      [
        "the inspection has no property",
        () => vi.mocked(getInspectionDetail).mockResolvedValue(detail({ inspection: inspection({ property_id: null }) }) as never),
        400,
      ],
      ["the property isn't linked to Rentvine", () => vi.mocked(prisma.inspectProperty.findUnique).mockResolvedValue({ rv_id: null } as never), 400],
    ])("refuses when %s", async (_label, arrange, status) => {
      arrange();
      expect((await resolve({ action: "work_order" })).status).toBe(status);
      expect(createRentvineWorkOrder).not.toHaveBeenCalled();
      expect(setResolution).not.toHaveBeenCalled();
    });

    it("does not mark it resolved when Rentvine rejects the work order", async () => {
      vi.mocked(createRentvineWorkOrder).mockResolvedValue({ ok: false, status: 422, error: "bad property" });

      const res = await resolve({ action: "work_order" });

      expect(res.status).toBe(422);
      expect(setResolution).not.toHaveBeenCalled();
    });
  });
});
