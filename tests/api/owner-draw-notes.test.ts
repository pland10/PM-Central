import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listAccountingStaff: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/owner-draw-notes-db", () => ({
  listOwnerDrawNotes: vi.fn(),
  addOwnerDrawNote: vi.fn(),
  ownerDrawNoteAuthor: vi.fn(),
  updateOwnerDrawNote: vi.fn(),
  deleteOwnerDrawNote: vi.fn(),
  markOwnerDrawNoteEmailed: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listAccountingStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import * as db from "@/lib/owner-draw-notes-db";
import { DELETE, GET, PATCH, POST } from "@/app/api/accounting/owner-draw-notes/route";

const URL = "https://pmilighthouse.app/api/accounting/owner-draw-notes";
const req = (method: string, body?: unknown, qs = "") =>
  new NextRequest(`${URL}${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const admin = { id: "u1", email: "admin@pmi.com", name: "Ann Admin", role: "admin" };
const coord = { id: "u2", email: "jr@pmi.com", name: "JR", role: "user" };
const note = { id: 5, body: "Charge next month: fridge $890", authorName: "Ann Admin", authorEmail: "admin@pmi.com", createdAt: "2026-11-13T12:00:00.000Z", editedAt: null, emailedTo: null };

beforeEach(() => {
  vi.stubEnv("ACCOUNTING_ALLOWED_EMAILS", "jr@pmi.com");
  vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
  vi.mocked(listAccountingStaff).mockResolvedValue([
    { name: "Ann Admin", email: "admin@pmi.com" },
    { name: "JR", email: "jr@pmi.com" },
  ]);
  vi.mocked(db.listOwnerDrawNotes).mockResolvedValue([note]);
  vi.mocked(db.addOwnerDrawNote).mockResolvedValue(note);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e1" });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("owner draw notes API", () => {
  it("is hidden from people without Accounting access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u3", email: "tech@pmi.com", role: "user" } as never);
    expect((await GET(req("GET", undefined, "?portfolio=75"))).status).toBe(404);
    expect((await POST(req("POST", { portfolioId: "75", month: "2026-11", body: "x" }))).status).toBe(404);
  });

  it("lists an owner's notes (all months) and who can be emailed", async () => {
    const d = await (await GET(req("GET", undefined, "?portfolio=75"))).json();
    expect(db.listOwnerDrawNotes).toHaveBeenCalledWith("75");
    expect(d.notes).toEqual([note]);
    expect(d.staff).toHaveLength(2);
    expect(d.canModerate).toBe(true);
  });

  it("adds a note for the month without emailing", async () => {
    const res = await POST(req("POST", { portfolioId: "75", month: "2026-11", name: "Grant Holdings", body: "  hi  " }));
    expect(res.status).toBe(201);
    expect(db.addOwnerDrawNote).toHaveBeenCalledWith({
      portfolioId: "75",
      month: "2026-11",
      body: "hi",
      authorEmail: "admin@pmi.com",
      authorName: "Ann Admin",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("adds and emails accounting staff, naming the owner and month", async () => {
    const res = await POST(
      req("POST", { portfolioId: "75", month: "2026-11", name: "Grant Holdings", body: "Sent first half", emailTo: ["jr@pmi.com"] })
    );
    expect(res.status).toBe(201);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toEqual(["jr@pmi.com"]);
    expect(mail.subject).toContain("Grant Holdings");
    expect(mail.subject).toContain("November 2026");
    expect(mail.html).toContain("/accounting/owner-draws?month=2026-11");
    expect(db.markOwnerDrawNoteEmailed).toHaveBeenCalledWith(5, "jr@pmi.com");
  });

  it("won't email someone without Accounting access", async () => {
    const res = await POST(req("POST", { portfolioId: "75", month: "2026-11", body: "x", emailTo: ["outsider@x.com"] }));
    expect(res.status).toBe(400);
    expect(db.addOwnerDrawNote).not.toHaveBeenCalled();
  });

  it("rejects a bad month or missing owner", async () => {
    expect((await POST(req("POST", { portfolioId: "75", month: "2026-13", body: "x" }))).status).toBe(400);
    expect((await POST(req("POST", { portfolioId: "", month: "2026-11", body: "x" }))).status).toBe(400);
    expect((await GET(req("GET", undefined, ""))).status).toBe(400);
  });

  it("lets the author edit/delete, not others", async () => {
    vi.mocked(db.ownerDrawNoteAuthor).mockResolvedValue("admin@pmi.com");
    vi.mocked(db.updateOwnerDrawNote).mockResolvedValue({ ...note, body: "new" });
    expect((await PATCH(req("PATCH", { id: 5, body: "new" }))).status).toBe(200);
    vi.mocked(getCurrentUser).mockResolvedValue(coord as never);
    expect((await PATCH(req("PATCH", { id: 5, body: "x" }))).status).toBe(403);
    expect((await DELETE(req("DELETE", undefined, "?id=5"))).status).toBe(403);
  });
});
