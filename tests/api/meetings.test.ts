import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/meetings-db", () => ({
  upsertMeetingNote: vi.fn(async () => {}),
  setPropertyRemoved: vi.fn(async () => {}),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { upsertMeetingNote, setPropertyRemoved } from "@/lib/meetings-db";
import { POST as notesPOST } from "@/app/api/meetings/notes/route";
import { POST as removePOST } from "@/app/api/meetings/remove/route";

const req = (url: string, body: unknown) =>
  new NextRequest(`https://pmilighthouse.app${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "user" } as never));
afterEach(() => vi.clearAllMocks());

describe("POST /api/meetings/notes", () => {
  it("saves a note for a property + meeting date", async () => {
    const res = await notesPOST(req("/api/meetings/notes", { propertyId: "p1", date: "2026-11-16", body: "roof ok" }));
    expect(res.status).toBe(200);
    expect(upsertMeetingNote).toHaveBeenCalledWith("p1", "2026-11-16", "roof ok");
  });

  it("rejects a bad date or missing property", async () => {
    expect((await notesPOST(req("/api/meetings/notes", { propertyId: "p1", date: "11/16/2026", body: "x" }))).status).toBe(400);
    expect((await notesPOST(req("/api/meetings/notes", { propertyId: "", date: "2026-11-16", body: "x" }))).status).toBe(400);
    expect(upsertMeetingNote).not.toHaveBeenCalled();
  });

  it("401s when logged out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await notesPOST(req("/api/meetings/notes", { propertyId: "p1", date: "2026-11-16", body: "x" }))).status).toBe(401);
  });
});

describe("POST /api/meetings/remove", () => {
  it("removes and restores a property", async () => {
    expect((await removePOST(req("/api/meetings/remove", { propertyId: "p1", removed: true }))).status).toBe(200);
    expect(setPropertyRemoved).toHaveBeenCalledWith("p1", true);
    await removePOST(req("/api/meetings/remove", { propertyId: "p1", removed: false }));
    expect(setPropertyRemoved).toHaveBeenCalledWith("p1", false);
  });

  it("400s a missing property and 401s when logged out", async () => {
    expect((await removePOST(req("/api/meetings/remove", { removed: true }))).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await removePOST(req("/api/meetings/remove", { propertyId: "p1", removed: true }))).status).toBe(401);
  });
});
