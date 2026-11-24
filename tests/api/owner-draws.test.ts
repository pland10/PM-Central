import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/owner-draws-db", () => ({
  getDrawRecord: vi.fn(),
  setDrawOverride: vi.fn(async () => {}),
  setDrawNote: vi.fn(async () => {}),
  setDrawStatus: vi.fn(async () => {}),
}));
vi.mock("@/lib/owner-draws-rentvine", () => ({ loadOwnerDrawData: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import * as db from "@/lib/owner-draws-db";
import { loadOwnerDrawData } from "@/lib/owner-draws-rentvine";
import { monthKeyET, type DrawRecord } from "@/lib/owner-draws";
import { POST } from "@/app/api/accounting/owner-draws/route";

const MONTH = monthKeyET();
const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/accounting/owner-draws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const rec = (r: Partial<DrawRecord> = {}): DrawRecord => ({
  portfolioId: "75",
  balanceOverride: null,
  reserveOverride: null,
  unpaidOverride: null,
  note: "",
  approvedAt: null,
  approvedBy: null,
  paidAt: null,
  paidBy: null,
  snapshot: null,
  ...r,
});

const live = {
  ok: true as const,
  portfolios: [{ portfolioId: "75", name: "Grant", owners: ["Ann"], balance: 3000, reserve: 500, unpaid: 100, hold: false }],
  bills: new Map([["75", [{ billId: "1", description: "Pest Control", amount: 100, dateDue: "" }]]]),
};

const asAdmin = () =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "boss@x.com", name: "Boss", role: "admin" } as never);
const asCoordinator = () =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "jr@x.com", name: "JR", role: "user" } as never);

beforeEach(() => {
  asAdmin();
  vi.stubEnv("ACCOUNTING_ALLOWED_EMAILS", "jr@x.com");
  vi.mocked(db.getDrawRecord).mockResolvedValue(rec());
  vi.mocked(loadOwnerDrawData).mockResolvedValue(live);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/accounting/owner-draws", () => {
  it("edits a number, resets it with null, and returns the saved record", async () => {
    const res = await post({ month: MONTH, portfolioId: "75", action: "set", field: "reserve", value: 250 });
    expect(res.status).toBe(200);
    expect(db.setDrawOverride).toHaveBeenCalledWith(MONTH, "75", "reserve", 250, "Boss");
    expect((await res.json()).record).toMatchObject({ portfolioId: "75" });

    await post({ month: MONTH, portfolioId: "75", action: "set", field: "unpaid", value: null });
    expect(db.setDrawOverride).toHaveBeenLastCalledWith(MONTH, "75", "unpaid", null, "Boss");
  });

  it("rejects bad input", async () => {
    expect((await post({ month: "2026-13", portfolioId: "75", action: "note", value: "x" })).status).toBe(400);
    expect((await post({ month: MONTH, portfolioId: "", action: "note", value: "x" })).status).toBe(400);
    expect((await post({ month: MONTH, portfolioId: "75", action: "set", field: "rent", value: 1 })).status).toBe(400);
    expect((await post({ month: MONTH, portfolioId: "75", action: "set", field: "reserve", value: "abc" })).status).toBe(400);
    expect((await post({ month: MONTH, portfolioId: "75", action: "set", field: "reserve", value: 1e10 })).status).toBe(400);
    expect((await post({ month: MONTH, portfolioId: "75", action: "nope" })).status).toBe(400);
  });

  it("won't change the numbers on a row marked paid", async () => {
    vi.mocked(db.getDrawRecord).mockResolvedValue(rec({ paidAt: "2026-11-05T00:00:00Z" }));
    const res = await post({ month: MONTH, portfolioId: "75", action: "set", field: "reserve", value: 250 });
    expect(res.status).toBe(409);
    expect(db.setDrawOverride).not.toHaveBeenCalled();
  });

  it("saves the note", async () => {
    await post({ month: MONTH, portfolioId: "75", action: "note", value: "  Charge next month: fridge  " });
    expect(db.setDrawNote).toHaveBeenCalledWith(MONTH, "75", "Charge next month: fridge", "Boss");
  });

  it("approving freezes today's Rentvine figures", async () => {
    const res = await post({ month: MONTH, portfolioId: "75", action: "approve", expectDue: 2400 });
    expect(res.status).toBe(200);
    expect(loadOwnerDrawData).toHaveBeenCalledWith("75");
    expect(db.setDrawStatus).toHaveBeenCalledWith(MONTH, "75", "approved", true, "Boss", {
      name: "Grant",
      owners: ["Ann"],
      balance: 3000,
      reserve: 500,
      unpaid: 100,
      hold: false,
      bills: [{ billId: "1", description: "Pest Control", amount: 100, dateDue: "" }],
    });
  });

  it("refuses to approve when Rentvine moved since the page loaded", async () => {
    const res = await post({ month: MONTH, portfolioId: "75", action: "approve", expectDue: 1999 });
    expect(res.status).toBe(409);
    expect(db.setDrawStatus).not.toHaveBeenCalled();
  });

  it("only approvers approve; the coordinator can still edit and mark paid", async () => {
    asCoordinator();
    expect((await post({ month: MONTH, portfolioId: "75", action: "approve", expectDue: 2400 })).status).toBe(403);
    expect((await post({ month: MONTH, portfolioId: "75", action: "unapprove" })).status).toBe(403);
    expect((await post({ month: MONTH, portfolioId: "75", action: "note", value: "hi" })).status).toBe(200);
    expect((await post({ month: MONTH, portfolioId: "75", action: "paid" })).status).toBe(200);
    expect(db.setDrawStatus).toHaveBeenCalledWith(MONTH, "75", "paid", true, "JR", expect.objectContaining({ balance: 3000 }));
  });

  it("marking paid on an already-frozen row doesn't call Rentvine", async () => {
    const snapshot = { name: "Grant", owners: [], balance: 1, reserve: 0, unpaid: 0, hold: false, bills: [] };
    vi.mocked(db.getDrawRecord).mockResolvedValue(rec({ approvedAt: "x", snapshot }));
    await post({ month: MONTH, portfolioId: "75", action: "paid" });
    expect(loadOwnerDrawData).not.toHaveBeenCalled();
    expect(db.setDrawStatus).toHaveBeenCalledWith(MONTH, "75", "paid", true, "Boss", null);
  });

  it("can't approve a past month that was never frozen", async () => {
    const res = await post({ month: "2020-01", portfolioId: "75", action: "approve", expectDue: 0 });
    expect(res.status).toBe(409);
  });

  it("undoes approval and paid", async () => {
    await post({ month: MONTH, portfolioId: "75", action: "unapprove" });
    expect(db.setDrawStatus).toHaveBeenCalledWith(MONTH, "75", "approved", false, "Boss", null);
    await post({ month: MONTH, portfolioId: "75", action: "unpaid" });
    expect(db.setDrawStatus).toHaveBeenLastCalledWith(MONTH, "75", "paid", false, "Boss", null);
  });

  it("is hidden from people without Accounting", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u3", email: "x@y.com", role: "user" } as never);
    expect((await post({ month: MONTH, portfolioId: "75", action: "note", value: "x" })).status).toBe(404);
  });
});
