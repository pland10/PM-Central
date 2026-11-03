import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reminders-db", () => ({ getReminderTemplate: vi.fn(), saveReminderTemplate: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getReminderTemplate, saveReminderTemplate } from "@/lib/reminders-db";
import { GET, PUT } from "@/app/api/reminders/template/route";

const URL = "https://pmilighthouse.app/api/reminders/template";
const put = (body: unknown) =>
  PUT(new NextRequest(URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(getReminderTemplate).mockResolvedValue({ subject: "Hi", body: "Dear Resident" });
  vi.mocked(saveReminderTemplate).mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("/api/reminders/template", () => {
  it("GET returns the template to any signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u", email: "x@y.com", role: "user" } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).template).toEqual({ subject: "Hi", body: "Dear Resident" });
  });

  it("GET 401s when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("PUT saves for an admin, normalizing blanks to the default", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u", email: "admin@pmi.com", role: "admin" } as never);
    const res = await put({ subject: "  Pay please  ", body: "Dear {tenant}" });
    expect(res.status).toBe(200);
    const [tpl, by] = vi.mocked(saveReminderTemplate).mock.calls[0];
    expect(tpl).toEqual({ subject: "Pay please", body: "Dear {tenant}" });
    expect(by).toBe("admin@pmi.com");
  });

  it("PUT 403s a non-admin and 401s when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u", email: "x@y.com", role: "user" } as never);
    expect((await put({ subject: "x", body: "y" })).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await put({ subject: "x", body: "y" })).status).toBe(401);
    expect(saveReminderTemplate).not.toHaveBeenCalled();
  });
});
