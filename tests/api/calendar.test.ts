import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/admin-gate", () => ({ requireAdminUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn() }));
vi.mock("@/lib/calendar/db", () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  setTaskStatus: vi.fn(),
}));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { requireAdminUser } from "@/lib/admin-gate";
import { listStaff } from "@/lib/staff";
import { createCalendarEvent, deleteCalendarEvent, setTaskStatus, updateCalendarEvent } from "@/lib/calendar/db";
import { POST as createEvent } from "@/app/api/calendar/events/route";
import { DELETE as removeEvent, PATCH as editEvent } from "@/app/api/calendar/events/[id]/route";
import { POST as checkOff } from "@/app/api/calendar/status/route";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`https://pmilighthouse.app${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const EVENT = { title: "Reimbursables review", description: "", rule: "me-5", frequency: "monthly", month: null, adjust: "prior", ownerEmail: "ARI@pmi.com" };
const SAVED = { id: 9, ...EVENT, rule: "ME-5", ownerEmail: "ari@pmi.com", ownerName: "Ari", active: true };
const ADMIN = { id: "u1", email: "paul@pmi.com", name: "Paul", role: "admin" };

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(requireAdminUser).mockResolvedValue({ user: ADMIN } as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "ari@pmi.com", name: "Ari", role: "user" } as never);
  vi.mocked(listStaff).mockResolvedValue([{ name: "Ari", email: "ari@pmi.com" }, { name: "Paul", email: "paul@pmi.com" }]);
  vi.mocked(createCalendarEvent).mockResolvedValue(SAVED as never);
  vi.mocked(updateCalendarEvent).mockResolvedValue(SAVED as never);
  vi.mocked(deleteCalendarEvent).mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/calendar/events", () => {
  it("creates an event (admin), with the owner's name from the staff list", async () => {
    const res = await createEvent(req("/api/calendar/events", "POST", EVENT));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ event: SAVED });
    expect(createCalendarEvent).toHaveBeenCalledWith({}, expect.objectContaining({ rule: "ME-5", ownerEmail: "ari@pmi.com", ownerName: "Ari" }), "paul@pmi.com");
  });

  it("rejects a bad rule, or an owner who doesn't use PM Central", async () => {
    expect((await createEvent(req("/api/calendar/events", "POST", { ...EVENT, rule: "soon" }))).status).toBe(400);
    expect((await createEvent(req("/api/calendar/events", "POST", { ...EVENT, ownerEmail: "x@else.com" }))).status).toBe(400);
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("is admin only, and 404s when the calendar is off", async () => {
    vi.mocked(requireAdminUser).mockResolvedValueOnce({ error: "Admins only", status: 403 } as never);
    expect((await createEvent(req("/api/calendar/events", "POST", EVENT))).status).toBe(403);
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect((await createEvent(req("/api/calendar/events", "POST", EVENT))).status).toBe(404);
  });
});

describe("PATCH / DELETE /api/calendar/events/:id", () => {
  it("updates an event, 404 when it's gone", async () => {
    const res = await editEvent(req("/api/calendar/events/9", "PATCH", EVENT), ctx("9"));
    expect(res.status).toBe(200);
    expect(updateCalendarEvent).toHaveBeenCalledWith({}, 9, expect.objectContaining({ title: "Reimbursables review" }));
    vi.mocked(updateCalendarEvent).mockResolvedValueOnce(null);
    expect((await editEvent(req("/api/calendar/events/9", "PATCH", EVENT), ctx("9"))).status).toBe(404);
    expect((await editEvent(req("/api/calendar/events/x", "PATCH", EVENT), ctx("x"))).status).toBe(400);
  });

  it("deletes an event (admin only)", async () => {
    expect((await removeEvent(req("/api/calendar/events/9", "DELETE"), ctx("9"))).status).toBe(200);
    expect(deleteCalendarEvent).toHaveBeenCalledWith({}, 9);
    vi.mocked(requireAdminUser).mockResolvedValueOnce({ error: "Admins only", status: 403 } as never);
    expect((await removeEvent(req("/api/calendar/events/9", "DELETE"), ctx("9"))).status).toBe(403);
  });
});

describe("POST /api/calendar/status", () => {
  it("lets any signed-in user check a task off, recorded under their name", async () => {
    vi.mocked(setTaskStatus).mockResolvedValue({ ok: true, status: { doneBy: "ari@pmi.com", doneByName: "Ari", doneAt: "2026-11-24T15:00:00.000Z" } });
    const res = await checkOff(req("/api/calendar/status", "POST", { eventId: 9, period: "2026-11", done: true }));
    expect(res.status).toBe(200);
    expect(setTaskStatus).toHaveBeenCalledWith({}, 9, "2026-11", true, "ari@pmi.com", "Ari");
    expect((await res.json()).status).toMatchObject({ doneByName: "Ari" });
  });

  it("accepts a day for a daily task", async () => {
    vi.mocked(setTaskStatus).mockResolvedValue({ ok: true, status: null });
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: 9, period: "2026-11-24", done: false }))).status).toBe(200);
    expect(setTaskStatus).toHaveBeenCalledWith({}, 9, "2026-11-24", false, "ari@pmi.com", "Ari");
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: 9, period: "2026-11-32", done: true }))).status).toBe(400);
  });

  it("validates input, 404s an unknown event, 401s when signed out", async () => {
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: 9, period: "Nov", done: true }))).status).toBe(400);
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: "x", period: "2026-11", done: true }))).status).toBe(400);
    vi.mocked(setTaskStatus).mockResolvedValueOnce({ ok: false });
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: 99, period: "2026-11", done: true }))).status).toBe(404);
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect((await checkOff(req("/api/calendar/status", "POST", { eventId: 9, period: "2026-11", done: true }))).status).toBe(401);
  });
});
