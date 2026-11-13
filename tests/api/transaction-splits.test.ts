import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/annotation-checks", () => ({ checkAnnotationPatch: vi.fn(async (patch: unknown) => ({ patch })) }));
vi.mock("@/lib/transaction-splits-db", () => ({
  chargeAmount: vi.fn(),
  replaceSplits: vi.fn(),
  deleteSplits: vi.fn(),
  updateSplitLine: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { checkAnnotationPatch } from "@/lib/annotation-checks";
import * as db from "@/lib/transaction-splits-db";
import { DELETE, PUT } from "@/app/api/plaid/transactions/[transactionId]/splits/route";
import { PATCH } from "@/app/api/plaid/transactions/[transactionId]/splits/[lineId]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("https://pmilighthouse.app/api/plaid/transactions/t1/splits", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
const params = { params: Promise.resolve({ transactionId: "t1" }) };
const lineParams = (lineId: string) => ({ params: Promise.resolve({ transactionId: "t1", lineId }) });

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  vi.mocked(db.chargeAmount).mockResolvedValue(200);
  vi.mocked(db.replaceSplits).mockImplementation(async (_id, lines) => lines.map((l, i) => ({ ...l, id: 10 + i })));
  vi.mocked(db.deleteSplits).mockResolvedValue({
    reimbursable: "yes",
    categoryOverride: "Repairs",
    recordedQuickbooks: false,
    recordedRentvine: false,
    propertyId: null,
    unitId: null,
  });
  vi.mocked(db.updateSplitLine).mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("PUT /api/plaid/transactions/:id/splits", () => {
  it("saves lines that add up to the charge and returns them with their ids", async () => {
    const res = await PUT(
      req("PUT", { lines: [{ amount: 120, propertyId: "rentvine:12", reimbursable: "yes" }, { amount: 80, reimbursable: "no" }] }),
      params
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.lines.map((l: { id: number; amount: number }) => [l.id, l.amount])).toEqual([
      [10, 120],
      [11, 80],
    ]);
    expect(db.replaceSplits).toHaveBeenCalledWith("t1", expect.any(Array));
    // each line's category/property goes through the same checks as a row edit
    expect(checkAnnotationPatch).toHaveBeenCalledTimes(2);
  });

  it("refuses lines that don't add up to the charge", async () => {
    const res = await PUT(req("PUT", { lines: [{ amount: 120 }, { amount: 70 }] }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/\$10\.00 short/);
    expect(db.replaceSplits).not.toHaveBeenCalled();
  });

  it("refuses a line with a property that isn't one of yours", async () => {
    vi.mocked(checkAnnotationPatch).mockResolvedValueOnce({ error: "Pick a property from the list.", status: 400 });
    const res = await PUT(req("PUT", { lines: [{ amount: 120, propertyId: "bogus" }, { amount: 80 }] }), params);
    expect(res.status).toBe(400);
    expect(db.replaceSplits).not.toHaveBeenCalled();
  });

  it("404s for a charge that doesn't exist", async () => {
    vi.mocked(db.chargeAmount).mockResolvedValue(null);
    expect((await PUT(req("PUT", { lines: [{ amount: 1 }, { amount: 1 }] }), params)).status).toBe(404);
  });

  it("is hidden from people without Accounting access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "tech@pmi.com", role: "user" } as never);
    expect((await PUT(req("PUT", { lines: [] }), params)).status).toBe(404);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});

describe("DELETE /api/plaid/transactions/:id/splits (unsplit)", () => {
  it("removes the lines and hands back the charge's own fields", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(db.deleteSplits).toHaveBeenCalledWith("t1");
    expect((await res.json()).header).toMatchObject({ reimbursable: "yes", categoryOverride: "Repairs" });
  });
});

describe("PATCH /api/plaid/transactions/:id/splits/:lineId", () => {
  it("saves just the fields changed on that line", async () => {
    const res = await PATCH(req("PATCH", { recordedQuickbooks: true }), lineParams("10"));
    expect(res.status).toBe(200);
    expect(db.updateSplitLine).toHaveBeenCalledWith("t1", 10, { recordedQuickbooks: true });
  });

  it("can't change a line's amount here (that's the split editor's job)", async () => {
    const res = await PATCH(req("PATCH", { amount: 5 }), lineParams("10"));
    expect(res.status).toBe(400);
    expect(db.updateSplitLine).not.toHaveBeenCalled();
  });

  it("404s a line that isn't part of the charge", async () => {
    vi.mocked(db.updateSplitLine).mockResolvedValue(false);
    expect((await PATCH(req("PATCH", { reimbursable: "no" }), lineParams("99"))).status).toBe(404);
    expect((await PATCH(req("PATCH", { reimbursable: "no" }), lineParams("abc"))).status).toBe(400);
  });
});
