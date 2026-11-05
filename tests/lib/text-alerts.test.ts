import { describe, expect, it, vi } from "vitest";
import {
  buildAlert,
  collapseAttachments,
  phoneBook,
  runTextAlerts,
  type LsText,
  type TextAlertDeps,
} from "@/lib/text-alerts";

const text = (over: Partial<LsText>): LsText => ({
  id: "m1",
  direction: "outbound",
  to: "+15165551234",
  from: "+16316003616",
  body: "Hi, your rent is due",
  created_at: "2026-11-05T15:05:00Z",
  ...over,
});

describe("collapseAttachments", () => {
  it("folds empty attachment records into the text they belong to", () => {
    const out = collapseAttachments([
      text({ id: "a", created_at: "2026-11-05T15:05:00Z" }),
      text({ id: "b", body: "", created_at: "2026-11-05T15:05:02Z" }),
      text({ id: "c", body: "", created_at: "2026-11-05T15:05:03Z" }),
      text({ id: "d", body: "", to: "+19998887777", created_at: "2026-11-05T15:06:00Z" }), // nothing to attach to
    ]);
    expect(out.map((m) => [m.id, m.attachments])).toEqual([["a", 2]]);
  });
});

describe("phoneBook", () => {
  it("maps numbers to the deal with the fewest contacts (not a mail merge)", () => {
    const book = phoneBook([
      { deal_name: "Mail Merge", contact_phones: "+1 516 555 1234, +1 516 555 0000, +1 516 555 1111" },
      { deal_name: "Smith Trust", contact_phones: "(516) 555-1234" },
    ]);
    expect(book.get("5165551234")).toBe("Smith Trust");
    expect(book.get("5165550000")).toBe("Mail Merge");
  });
});

describe("buildAlert", () => {
  it("names who was texted, in New York time, with the message escaped", () => {
    const a = buildAlert({ ...text({ body: "Rent <due> & late" }), attachments: 1 }, new Map([["5165551234", "Smith Trust"]]));
    expect(a.subject).toBe("Outbound text to Smith Trust ((516) 555-1234)");
    expect(a.html).toContain("Nov 5, 2026, 10:05 AM");
    expect(a.html).toContain("Rent &lt;due&gt; &amp; late");
    expect(a.html).toContain("Attachments:</b> 1");
  });
});

function deps(over: Partial<TextAlertDeps> = {}): TextAlertDeps & { saved: unknown[]; sent: string[] } {
  const saved: unknown[] = [];
  const sent: string[] = [];
  return {
    saved,
    sent,
    loadState: vi.fn(async () => ({ since: "2026-11-05T15:00:00Z", sentIds: ["old"] })),
    saveState: vi.fn(async (since: string, ids: string[]) => {
      saved.push({ since, ids });
    }),
    fetchPage: vi.fn(async (page: number) =>
      page === 1
        ? [
            text({ id: "m3", created_at: "2026-11-05T15:20:00Z" }),
            text({ id: "in", direction: "inbound", created_at: "2026-11-05T15:15:00Z" }),
            text({ id: "m2", created_at: "2026-11-05T15:10:00Z" }),
            text({ id: "x", created_at: "2026-11-05T14:00:00Z" }), // before the watermark
          ]
        : []
    ),
    phoneRows: vi.fn(async () => [{ deal_name: "Smith Trust", contact_phones: "5165551234" }]),
    send: vi.fn(async (a: { subject: string }) => {
      sent.push(a.subject);
      return true;
    }),
    heartbeat: vi.fn(async () => {}),
    recipients: ["info@pmilighthouse.com"],
    now: () => new Date("2026-11-05T15:25:00Z"),
    ...over,
  };
}

describe("runTextAlerts", () => {
  it("emails each new outbound text oldest first, then moves the watermark to the newest sent", async () => {
    const d = deps();
    expect(await runTextAlerts(d)).toEqual({ sent: 2, watchingFrom: "2026-11-05T15:20:00Z" });
    expect(d.sent).toEqual(["Outbound text to Smith Trust ((516) 555-1234)", "Outbound text to Smith Trust ((516) 555-1234)"]);
    expect(d.saved).toEqual([{ since: "2026-11-05T15:20:00Z", ids: ["m2", "m3", "old"] }]);
  });

  it("starts watching from now on its first run (no backlog)", async () => {
    const d = deps({ loadState: vi.fn(async () => ({ since: null, sentIds: [] })) });
    expect(await runTextAlerts(d)).toEqual({ sent: 0, watchingFrom: "2026-11-05T15:25:00Z" });
    expect(d.fetchPage).not.toHaveBeenCalled();
  });

  it("skips texts already alerted on, and does nothing without recipients", async () => {
    const d = deps({ loadState: vi.fn(async () => ({ since: "2026-11-05T15:00:00Z", sentIds: ["m2", "m3"] })) });
    expect((await runTextAlerts(d)).sent).toBe(0);
    const none = deps({ recipients: [] });
    expect(await runTextAlerts(none)).toEqual({ sent: 0, skipped: "no recipients configured" });
    expect(none.saveState).not.toHaveBeenCalled();
  });

  it("holds the watermark at the last text that actually went out if a send fails", async () => {
    let n = 0;
    const d = deps({ send: vi.fn(async () => ++n === 1) });
    expect(await runTextAlerts(d)).toEqual({ sent: 1, watchingFrom: "2026-11-05T15:10:00Z" });
  });
});
