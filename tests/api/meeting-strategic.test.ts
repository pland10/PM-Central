import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/meeting-topics-db", () => ({
  addSection: vi.fn(async () => 1),
  renameSection: vi.fn(async () => {}),
  deleteSection: vi.fn(async () => {}),
  addTopic: vi.fn(async () => 2),
  renameTopic: vi.fn(async () => {}),
  deleteTopic: vi.fn(async () => {}),
  upsertTopicNote: vi.fn(async () => {}),
  setTopicStatus: vi.fn(async () => {}),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import * as db from "@/lib/meeting-topics-db";
import { POST as secPOST, PATCH as secPATCH, DELETE as secDELETE } from "@/app/api/admin/meeting-sections/route";
import { POST as topPOST, PATCH as topPATCH, DELETE as topDELETE } from "@/app/api/admin/meeting-topics/route";
import { POST as notePOST } from "@/app/api/meetings/topic-notes/route";
import { POST as statusPOST } from "@/app/api/meetings/topic-status/route";

const mk = (method: string, url: string, body?: unknown) =>
  new NextRequest(`https://pmilighthouse.app${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const asAdmin = () => vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "admin" } as never);
const asUser = () => vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "user" } as never);

beforeEach(asAdmin);
afterEach(() => vi.clearAllMocks());

describe("admin meeting sections", () => {
  it("adds, renames, deletes", async () => {
    expect((await secPOST(mk("POST", "/api/admin/meeting-sections", { title: "Growth" }))).status).toBe(201);
    expect(db.addSection).toHaveBeenCalledWith("Growth");
    await secPATCH(mk("PATCH", "/api/admin/meeting-sections", { id: 1, title: "Growth & Sales" }));
    expect(db.renameSection).toHaveBeenCalledWith(1, "Growth & Sales");
    await secDELETE(mk("DELETE", "/api/admin/meeting-sections?id=1"));
    expect(db.deleteSection).toHaveBeenCalledWith(1);
  });

  it("rejects an empty title and gates non-admins", async () => {
    expect((await secPOST(mk("POST", "/api/admin/meeting-sections", { title: "  " }))).status).toBe(400);
    asUser();
    expect((await secPOST(mk("POST", "/api/admin/meeting-sections", { title: "X" }))).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await secPOST(mk("POST", "/api/admin/meeting-sections", { title: "X" }))).status).toBe(401);
  });
});

describe("admin meeting topics", () => {
  it("adds (under a section), renames, deletes", async () => {
    expect((await topPOST(mk("POST", "/api/admin/meeting-topics", { sectionId: 1, title: "Hiring" }))).status).toBe(201);
    expect(db.addTopic).toHaveBeenCalledWith(1, "Hiring");
    await topPATCH(mk("PATCH", "/api/admin/meeting-topics", { id: 2, title: "Hiring a PM" }));
    expect(db.renameTopic).toHaveBeenCalledWith(2, "Hiring a PM");
    await topDELETE(mk("DELETE", "/api/admin/meeting-topics?id=2"));
    expect(db.deleteTopic).toHaveBeenCalledWith(2);
  });

  it("needs a section id to add", async () => {
    expect((await topPOST(mk("POST", "/api/admin/meeting-topics", { title: "Hiring" }))).status).toBe(400);
    expect(db.addTopic).not.toHaveBeenCalled();
  });
});

describe("topic notes (any signed-in user)", () => {
  it("saves a dated note for a topic", async () => {
    asUser();
    const res = await notePOST(mk("POST", "/api/meetings/topic-notes", { topicId: 2, date: "2026-11-17", body: "hired" }));
    expect(res.status).toBe(200);
    expect(db.upsertTopicNote).toHaveBeenCalledWith(2, "2026-11-17", "hired");
  });

  it("rejects a bad date or topic, 401s when logged out", async () => {
    asUser();
    expect((await notePOST(mk("POST", "/api/meetings/topic-notes", { topicId: 2, date: "nope", body: "x" }))).status).toBe(400);
    expect((await notePOST(mk("POST", "/api/meetings/topic-notes", { topicId: 0, date: "2026-11-17", body: "x" }))).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await notePOST(mk("POST", "/api/meetings/topic-notes", { topicId: 2, date: "2026-11-17", body: "x" }))).status).toBe(401);
  });
});

describe("topic status (any signed-in user)", () => {
  it("sets a known status", async () => {
    asUser();
    const res = await statusPOST(mk("POST", "/api/meetings/topic-status", { topicId: 2, status: "done" }));
    expect(res.status).toBe(200);
    expect(db.setTopicStatus).toHaveBeenCalledWith(2, "done");
  });

  it("rejects an unknown status / bad topic, 401s when logged out", async () => {
    asUser();
    expect((await statusPOST(mk("POST", "/api/meetings/topic-status", { topicId: 2, status: "closed" }))).status).toBe(400);
    expect((await statusPOST(mk("POST", "/api/meetings/topic-status", { topicId: 0, status: "done" }))).status).toBe(400);
    expect(db.setTopicStatus).not.toHaveBeenCalled();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await statusPOST(mk("POST", "/api/meetings/topic-status", { topicId: 2, status: "done" }))).status).toBe(401);
  });
});
