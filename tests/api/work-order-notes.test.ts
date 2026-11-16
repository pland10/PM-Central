import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeQueries, sqlOf } from "../helpers/sql";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)) },
}));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/work-order-tech-db", () => ({ getTech: vi.fn(async () => null) }));
vi.mock("@/lib/notify-wo-updated", () => ({ notifyWorkOrderNote: vi.fn(async () => ({ notified: false })) }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { sendEmail } from "@/lib/email";
import { getTech } from "@/lib/work-order-tech-db";
import { notifyWorkOrderNote } from "@/lib/notify-wo-updated";
import { DELETE, GET, PATCH, POST } from "@/app/api/work-orders/notes/route";

const queryRaw = vi.mocked(prisma.$queryRaw);
const executeRaw = vi.mocked(prisma.$executeRaw);
const URL = "https://pmilighthouse.app/api/work-orders/notes";
const post = (body: unknown) =>
  POST(new NextRequest(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new NextRequest(URL, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const del = (id: string) => DELETE(new NextRequest(`${URL}?id=${id}`, { method: "DELETE" }));

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
      { id: 7, body: "Call the plumber", authorName: "Paul Landman", authorEmail: "paul@pmi.com", createdAt: "2026-11-02T14:00:00.000Z", editedAt: null, emailedTo: null },
    ]);
    expect(body.staff).toHaveLength(2);
    expect(body.assigneeEmail).toBe("jasper@pmi.com");
    expect(body.me).toBe("paul@pmi.com");
    expect(body.canModerate).toBe(true);
  });

  it("saves a note without emailing anyone by default", async () => {
    const res = await post({ woId: "abc", body: " Call the plumber " });
    expect(res.status).toBe(201);
    const insert = queryRaw.mock.calls.find((c) => /INSERT INTO work_order_notes/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(insert.values).toEqual(["abc", "100480", "Call the plumber", "paul@pmi.com", "Paul Landman"]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await res.json()).emailed).toBe(false);
  });

  it("pings the in-house tech of a new note (not the author)", async () => {
    vi.mocked(getTech).mockResolvedValueOnce({ email: "ari@pmi.com", name: "Ari" });
    const res = await post({ woId: "abc", body: "Call the plumber" });
    expect(res.status).toBe(201);
    expect(notifyWorkOrderNote).toHaveBeenCalledWith(
      expect.objectContaining({ tech: { email: "ari@pmi.com", name: "Ari" }, woId: "abc", woNumber: "100480", byEmail: "paul@pmi.com", body: "Call the plumber" })
    );
  });

  it("does not ping a tech when none is assigned", async () => {
    await post({ woId: "abc", body: "Call the plumber" }); // getTech defaults to null
    expect(notifyWorkOrderNote).not.toHaveBeenCalled();
  });

  it("emails the chosen staff member only when asked, and records it", async () => {
    const res = await post({ woId: "abc", body: "Call the plumber", emailTo: "jasper@pmi.com" });
    expect(res.status).toBe(201);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toEqual(["jasper@pmi.com"]);
    expect(mail.replyTo).toBe("paul@pmi.com");
    expect(mail.subject).toBe("Note on WO #100480 — Garage door wire broke");
    const upd = executeRaw.mock.calls.find((c) => /UPDATE work_order_notes SET emailed_to/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(upd.values).toEqual(["jasper@pmi.com", 7]);
    expect((await res.json()).emailed).toBe(true);
  });

  it("emails several staff in one message and records them all", async () => {
    const res = await post({ woId: "abc", body: "FYI both", emailTo: ["jasper@pmi.com", "paul@pmi.com"] });
    expect(res.status).toBe(201);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toEqual(["jasper@pmi.com", "paul@pmi.com"]);
    const upd = executeRaw.mock.calls.find((c) => /UPDATE work_order_notes SET emailed_to/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(upd.values).toEqual(["jasper@pmi.com, paul@pmi.com", 7]);
    expect(await res.json()).toMatchObject({ emailed: true, note: { emailedTo: "jasper@pmi.com, paul@pmi.com" } });
  });

  it("won't email anyone if one of several isn't a PM-Central user", async () => {
    const res = await post({ woId: "abc", body: "hi", emailTo: ["jasper@pmi.com", "random@example.com"] });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
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

  describe("PATCH (edit)", () => {
    const authorRow = [{ author_email: "paul@pmi.com" }];
    const updatedRow = [{
      id: 7, body: "Edited text", author_name: "Paul Landman", author_email: "paul@pmi.com",
      created_at: new Date("2026-11-02T14:00:00Z"), edited_at: new Date("2026-11-02T15:00:00Z"), emailed_to: null,
    }];

    it("edits a note and stamps edited_at", async () => {
      queryRaw.mockImplementation(routeQueries([
        [/SELECT author_email FROM work_order_notes WHERE id/, authorRow],
        [/UPDATE work_order_notes SET body/, updatedRow],
      ]) as never);
      const res = await patch({ id: 7, body: " Edited text " });
      expect(res.status).toBe(200);
      const upd = queryRaw.mock.calls.find((c) => /UPDATE work_order_notes SET body/.test(sqlOf(c[0])))![0] as { values: unknown[] };
      expect(upd.values).toEqual(["Edited text", 7]);
      expect((await res.json()).note).toMatchObject({ id: 7, body: "Edited text", editedAt: "2026-11-02T15:00:00.000Z" });
    });

    it("lets only the author or an admin edit", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "someone@pmi.com", name: "Someone", role: "user" } as never);
      queryRaw.mockImplementation(routeQueries([
        [/SELECT author_email FROM work_order_notes WHERE id/, authorRow],
        [/UPDATE work_order_notes SET body/, updatedRow],
      ]) as never);
      const res = await patch({ id: 7, body: "nope" });
      expect(res.status).toBe(403);
      expect(queryRaw.mock.calls.some((c) => /UPDATE work_order_notes SET body/.test(sqlOf(c[0])))).toBe(false);
    });

    it("400s a missing id or empty body, 404s a gone note", async () => {
      expect((await patch({ body: "x" })).status).toBe(400);
      expect((await patch({ id: 7, body: "   " })).status).toBe(400);
      queryRaw.mockImplementation(routeQueries([[/SELECT author_email FROM work_order_notes WHERE id/, []]]) as never);
      expect((await patch({ id: 7, body: "x" })).status).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("deletes a note (author or admin) and is idempotent when it's already gone", async () => {
      queryRaw.mockImplementation(routeQueries([[/SELECT author_email FROM work_order_notes WHERE id/, [{ author_email: "paul@pmi.com" }]]]) as never);
      const res = await del("7");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(executeRaw.mock.calls.some((c) => /DELETE FROM work_order_notes/.test(sqlOf(c[0])))).toBe(true);

      // Already gone → still ok, no delete issued.
      executeRaw.mockClear();
      queryRaw.mockImplementation(routeQueries([[/SELECT author_email FROM work_order_notes WHERE id/, []]]) as never);
      const gone = await del("7");
      expect(gone.status).toBe(200);
      expect(executeRaw.mock.calls.some((c) => /DELETE FROM work_order_notes/.test(sqlOf(c[0])))).toBe(false);
    });

    it("lets only the author or an admin delete", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "someone@pmi.com", name: "Someone", role: "user" } as never);
      queryRaw.mockImplementation(routeQueries([[/SELECT author_email FROM work_order_notes WHERE id/, [{ author_email: "paul@pmi.com" }]]]) as never);
      const res = await del("7");
      expect(res.status).toBe(403);
      expect(executeRaw.mock.calls.some((c) => /DELETE FROM work_order_notes/.test(sqlOf(c[0])))).toBe(false);
    });

    it("400s a missing id", async () => {
      expect((await DELETE(new NextRequest(URL, { method: "DELETE" }))).status).toBe(400);
    });
  });
});

describe("/api/work-orders/notes — a work order just created from PM-Central", () => {
  const CREATED = { wo_number: "100412", description: "No heat\nsince last night", property_label: "8204 138th Street, Jamaica, NY 11435" };
  const NOTE = { id: 9, created_at: new Date("2026-11-14T15:00:00Z") };

  it("saves a note on the stand-in while LeadSimple doesn't have it yet", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM work_orders WHERE wo_number/, []],
        [/COUNT\(\*\)::int AS n FROM pm_created_work_orders/, [{ n: 1 }]],
        [/FROM pm_created_work_orders WHERE wo_number/, [CREATED]],
        [/INSERT INTO work_order_notes/, [NOTE]],
      ]) as never
    );
    const res = await post({ woId: "pmc:100412", body: "Tenant home after 3" });
    expect(res.status).toBe(201);
    const insert = queryRaw.mock.calls.find((c) => /INSERT INTO work_order_notes/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(insert.values.slice(0, 3)).toEqual(["pmc:100412", "100412", "Tenant home after 3"]);
  });

  it("saves onto the LeadSimple row once it has arrived (moving the earlier notes over first)", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM work_orders WHERE wo_number/, [{ source_id: "ls-9" }]],
        [/to_regclass/, [{ notes: true, techs: true }]],
        [/FROM work_orders WHERE source_id/, [WO]],
        [/INSERT INTO work_order_notes/, [NOTE]],
      ]) as never
    );
    await post({ woId: "pmc:100412", body: "Tenant home after 3" });
    expect(executeRaw.mock.calls.some((c) => /UPDATE work_order_notes SET wo_id/.test(sqlOf(c[0])))).toBe(true);
    const insert = queryRaw.mock.calls.find((c) => /INSERT INTO work_order_notes/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(insert.values[0]).toBe("ls-9");
  });

  it("lists the stand-in's notes", async () => {
    queryRaw.mockImplementation(
      routeQueries([
        [/FROM work_orders WHERE wo_number/, []],
        [/COUNT\(\*\)::int AS n FROM pm_created_work_orders/, [{ n: 1 }]],
        [/FROM pm_created_work_orders WHERE wo_number/, [CREATED]],
        [/FROM work_order_notes WHERE wo_id/, []],
      ]) as never
    );
    const res = await GET(new NextRequest(`${URL}?wo=pmc:100412`));
    expect(res.status).toBe(200);
    const list = queryRaw.mock.calls.find((c) => /FROM work_order_notes WHERE wo_id/.test(sqlOf(c[0])))![0] as { values: unknown[] };
    expect(list.values[0]).toBe("pmc:100412");
  });
});
