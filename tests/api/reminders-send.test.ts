import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: vi.fn(() => true), sendEmail: vi.fn() }));
vi.mock("@/lib/reminders-db", () => ({
  fetchRecipients: vi.fn(),
  getReminderTemplate: vi.fn(),
  recordReminders: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { fetchRecipients, getReminderTemplate, recordReminders } from "@/lib/reminders-db";
import { POST } from "@/app/api/reminders/send/route";

const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/reminders/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const recip = (over: Partial<{ leaseId: string; tenant: string; property: string; email: string; amount: number }> = {}) => ({
  leaseId: "l1", tenant: "Jordan Lee", property: "12 Oak St", email: "jordan@example.com", amount: 1200, ...over,
});

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "john@pmi.com", name: "John Ray", role: "user" } as never);
  vi.mocked(isEmailConfigured).mockReturnValue(true);
  vi.mocked(getReminderTemplate).mockResolvedValue({ subject: "Balance of {balance}", body: "Dear {tenant}, you owe {balance} on {property}." });
  vi.mocked(fetchRecipients).mockResolvedValue([recip()]);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e1" });
  vi.mocked(recordReminders).mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/reminders/send", () => {
  it("sends to each resolved recipient as the logged-in user, with merge fields filled", async () => {
    const res = await post({ leaseIds: ["l1"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, failed: [], skipped: 0 });

    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("jordan@example.com");
    expect(mail.subject).toBe("Balance of $1,200.00");
    expect(mail.html).toContain("Dear Jordan Lee, you owe $1,200.00 on 12 Oak St.");
    expect(mail.from).toBe("John Ray <notifications@pmilighthouse.app>"); // the user's name on the notifications mailbox
    expect(mail.replyTo).toBe("john@pmi.com"); // replies come back to them
    expect(recordReminders).toHaveBeenCalledWith([{ leaseId: "l1", tenant: "Jordan Lee", email: "jordan@example.com", amount: 1200 }], "john@pmi.com");
  });

  it("re-derives recipients server-side from the lease ids (ignores client-sent details)", async () => {
    await post({ leaseIds: ["l1", "l2"], email: "attacker@evil.com", amount: 999999 });
    expect(fetchRecipients).toHaveBeenCalledWith(["l1", "l2"]);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("jordan@example.com");
  });

  it("counts leases that can't be reminded as skipped and reports a failed send", async () => {
    vi.mocked(fetchRecipients).mockResolvedValue([recip({ leaseId: "l1" })]); // only 1 of 2 reachable
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, status: 502, error: "Resend down" });
    const res = await post({ leaseIds: ["l1", "l2"] });
    const d = await res.json();
    expect(d).toMatchObject({ sent: 0, skipped: 1 });
    expect(d.failed).toHaveLength(1);
    expect(recordReminders).not.toHaveBeenCalled();
  });

  it("guards auth, config, empty selection and nothing-reachable", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post({ leaseIds: ["l1"] })).status).toBe(401);

    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "john@pmi.com", name: "John Ray", role: "user" } as never);
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    expect((await post({ leaseIds: ["l1"] })).status).toBe(503);

    vi.mocked(isEmailConfigured).mockReturnValue(true);
    expect((await post({ leaseIds: [] })).status).toBe(400);

    vi.mocked(fetchRecipients).mockResolvedValue([]);
    expect((await post({ leaseIds: ["l1"] })).status).toBe(400);
  });
});
