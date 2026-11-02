import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn() },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { GET, POST } from "@/app/api/work-orders/notes/route";

const queryRaw = vi.mocked(prisma.$queryRaw);
const executeRaw = vi.mocked(prisma.$executeRaw);
const URL = "https://pmilighthouse.app/api/work-orders/notes";
const post = (body: unknown) =>
  POST(new NextRequest(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const WO = { wo_number: "100480", title: "Garage door wire broke", name: "WO #100480 - Garage door wire broke", property_address: "109 Chase Road", link: "https://ls/x", assignee_name: "Jasper Jed Belen" };

beforeEach(() => {
  vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(1);
  executeRaw.mockResolvedValue(1);
  queryRaw.mockImplementation(
    routeQueries([
      [/FROM work_orders WHERE source_id/, [WO]],
      [/INSERT INTO work_order_notes/, [{ id: 7, created_at: new Date("2026-11-02T14:00:00Z") }]],
      [/FROM work_order_notes WHERE wo_id/, [
        { id: 7, body: "Call the plumber", author_name: "Paul Landman", author_email: "paul@pmi.com", created_at: new Date("2026-11-02T14:00:00Z"), emailed_to: null },
      ]],
    ]) as never
  );
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "paul@pmi.com", name: "Paul Landman", role: "admin" } as never);
  vi.mocked(listStaff).mockResolvedValue([
    { name: "Jasper Jed Belen", email: "jasper@pmi.com" },
    { name: "Paul Landman", email: "paul@pmi.com" },
  ]);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e1" });
});
afterEach(() => vi.clearAllMocks());

describe("/api/work-orders/notes", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(new NextRequest(`${URL}?wo=abc`))).status).toBe(401);
    expect((await post({ woId: "abc", body: "hi" })).status).toBe(401);
  });

  it("lists a work order's notes newest first, with the staff to email and the assignee's email", async () => {
    const body = await (await GET(new NextRequest(`${URL}?wo=abc`))).json();
    expect(body.notes).toEqual([
      { id: 7, body: "Call the plumber", authorName: "Paul Landman", authorEmail: "paul@pmi.com", createdAt: "2026-11-02T14:00:00.000Z", emailedTo: null },
    ]);
    expect(body.staff).toHaveLength(2);
    expect(body.assigneeEmail).toBe("jasper@pmi.com");
  });

  it("saves a note without emailing anyone by default", async () => {
    const res = await post({ woId: "abc", body: " Call the plumber " });
    expect(res.status).toBe(201);
    const insert = queryRaw.mock.calls.find((c) => /INSERT INTO work_order_notes/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(insert.values).toEqual(["abc", "100480", "Call the plumber", "paul@pmi.com", "Paul Landman"]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await res.json()).emailed).toBe(false);
  });

  it("emails the chosen staff member only when asked, and records it", async () => {
    const res = await post({ woId: "abc", body: "Call the plumber", emailTo: "jasper@pmi.com" });
    expect(res.status).toBe(201);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("jasper@pmi.com");
    expect(mail.replyTo).toBe("paul@pmi.com");
    expect(mail.subject).toBe("Note on WO #100480 — Garage door wire broke");
    const upd = executeRaw.mock.calls.find((c) => /UPDATE work_order_notes SET emailed_to/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(upd.values).toEqual(["jasper@pmi.com", 7]);
    expect((await res.json()).emailed).toBe(true);
  });

  it("won't email someone who isn't a PM-Central user", async () => {
    const res = await post({ woId: "abc", body: "hi", emailTo: "random@example.com" });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls.some((c) => /INSERT INTO work_order_notes/.test(sqlOf(c[0])))).toBe(false);
  });

  it("keeps the note but reports it when the email fails", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, status: 502, error: "Resend down" });
    const res = await post({ woId: "abc", body: "hi", emailTo: "jasper@pmi.com" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ emailed: false, emailError: "Resend down" });
  });

  it("rejects an empty note or an unknown work order", async () => {
    expect((await post({ woId: "abc", body: "  " })).status).toBe(400);
    queryRaw.mockImplementation(routeQueries([[/FROM work_orders WHERE source_id/, []]]) as never);
    expect((await post({ woId: "nope", body: "hi" })).status).toBe(404);
  });
});
