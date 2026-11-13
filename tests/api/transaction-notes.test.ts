import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listAccountingStaff: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/transaction-notes-db", () => ({
  listTransactionNotes: vi.fn(),
  addTransactionNote: vi.fn(),
  transactionNoteAuthor: vi.fn(),
  updateTransactionNote: vi.fn(),
  deleteTransactionNote: vi.fn(),
  markTransactionNoteEmailed: vi.fn(),
  transactionForNote: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { listAccountingStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import * as db from "@/lib/transaction-notes-db";
import { DELETE, GET, PATCH, POST } from "@/app/api/accounting/transaction-notes/route";

const URL = "https://pmilighthouse.app/api/accounting/transaction-notes";
const req = (method: string, body?: unknown, qs = "") =>
  new NextRequest(`${URL}${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const admin = { id: "u1", email: "admin@pmi.com", name: "Ann Admin", role: "admin" };
const note = { id: 5, body: "Owner to repay", authorName: "Ann Admin", authorEmail: "admin@pmi.com", createdAt: "2026-11-13T12:00:00.000Z", editedAt: null, emailedTo: null };
const txn = { date: "2026-11-04", merchant: "The Home Depot", account: "Home Depot Pro", amount: 27.06, property: "18-47 26th Rd · Astoria" };

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
  vi.mocked(listAccountingStaff).mockResolvedValue([
    { name: "Ann Admin", email: "admin@pmi.com" },
    { name: "Bo Bookkeeper", email: "bo@pmi.com" },
  ]);
  vi.mocked(db.listTransactionNotes).mockResolvedValue([note]);
  vi.mocked(db.addTransactionNote).mockResolvedValue(note);
  vi.mocked(db.transactionForNote).mockResolvedValue(txn);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e1" });
});
afterEach(() => vi.clearAllMocks());

describe("transaction notes API", () => {
  it("is hidden from people without Accounting access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "tech@pmi.com", role: "user" } as never);
    expect((await GET(req("GET", undefined, "?txn=t1"))).status).toBe(404);
    expect((await POST(req("POST", { transactionId: "t1", body: "x" }))).status).toBe(404);
    expect(db.listTransactionNotes).not.toHaveBeenCalled();
  });

  it("lists a charge's notes and the people who can be emailed", async () => {
    const res = await GET(req("GET", undefined, "?txn=t1"));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(db.listTransactionNotes).toHaveBeenCalledWith("t1");
    expect(d.notes).toEqual([note]);
    expect(d.staff.map((s: { email: string }) => s.email)).toEqual(["admin@pmi.com", "bo@pmi.com"]);
    expect(d.canModerate).toBe(true);
  });

  it("adds a note without emailing anyone", async () => {
    const res = await POST(req("POST", { transactionId: "t1", body: "  Owner to repay  " }));
    expect(res.status).toBe(201);
    expect(db.addTransactionNote).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "t1", body: "Owner to repay", authorEmail: "admin@pmi.com" }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the note with the charge's details, replying to the author", async () => {
    const res = await POST(req("POST", { transactionId: "t1", body: "Please code to repairs", emailTo: "BO@pmi.com" }));
    const d = await res.json();
    expect(d.emailed).toBe(true);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("bo@pmi.com");
    expect(mail.replyTo).toBe("admin@pmi.com");
    expect(mail.subject).toContain("$27.06");
    expect(mail.html).toContain("https://pmilighthouse.app/accounting");
    expect(db.markTransactionNoteEmailed).toHaveBeenCalledWith(5, "bo@pmi.com");
  });

  it("refuses to email anyone without Accounting access", async () => {
    const res = await POST(req("POST", { transactionId: "t1", body: "x", emailTo: "stranger@gmail.com" }));
    expect(res.status).toBe(400);
    expect(db.addTransactionNote).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("404s a note on a charge that doesn't exist", async () => {
    vi.mocked(db.transactionForNote).mockResolvedValue(null);
    expect((await POST(req("POST", { transactionId: "nope", body: "x" }))).status).toBe(404);
  });

  it("lets only the author (or an admin) edit or delete", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u3", email: "bo@pmi.com", role: "user" } as never);
    process.env.ACCOUNTING_ALLOWED_EMAILS = "bo@pmi.com";
    vi.mocked(db.transactionNoteAuthor).mockResolvedValue("admin@pmi.com");
    expect((await PATCH(req("PATCH", { id: 5, body: "edit" }))).status).toBe(403);
    expect((await DELETE(req("DELETE", undefined, "?id=5"))).status).toBe(403);

    vi.mocked(db.transactionNoteAuthor).mockResolvedValue("bo@pmi.com");
    vi.mocked(db.updateTransactionNote).mockResolvedValue({ ...note, body: "edit" });
    expect((await PATCH(req("PATCH", { id: 5, body: "edit" }))).status).toBe(200);
    expect((await DELETE(req("DELETE", undefined, "?id=5"))).status).toBe(200);
    delete process.env.ACCOUNTING_ALLOWED_EMAILS;
  });
});
