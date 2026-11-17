import { describe, expect, it } from "vitest";
import { buildDailySummary, isSummaryTime, parseRecipients, type DailySummaryData } from "@/lib/calendar/daily-summary";

const DATA: DailySummaryData = {
  date: "2026-11-18",
  dueToday: [
    { title: "Reimbursables review", rule: "Daily", owner: "Jasper Belen", done: false },
    { title: "Reconcile <bank> accounts", rule: "BD5", owner: null, done: true },
  ],
  overdue: [{ title: "Assess late fees", rule: "D6", owner: "Ari", date: "2026-11-06" }],
  workOrders: [{ number: "4567", issue: "Roof leak", property: "123 Main St", priority: "High", link: "", isNew: true, isHigh: true }],
  returnedPayments: [{ id: "p1", tenant: "Jane Doe", property: "9 Oak Ave", amount: 1250 }],
  draws: { count: 3, total: 1600.4 },
  syncProblems: [{ id: "x", label: "Rentvine payments", cadence: "Daily", lastRun: "2026-11-16T10:00:00Z" }],
};

describe("buildDailySummary", () => {
  it("has a dated subject with the key counts", () => {
    const { subject } = buildDailySummary(DATA, "https://pmilighthouse.app");
    expect(subject).toBe("PM Central daily summary · Wed, Nov 18 · 1 task due, 1 overdue, 4 alerts"); // WO + returned payment + draws + sync
  });

  it("lists today's tasks (done or not), overdue ones, and each alert section, escaped", () => {
    const { html } = buildDailySummary(DATA, "https://pmilighthouse.app");
    expect(html).toContain("Reimbursables review");
    expect(html).toContain("Jasper Belen");
    expect(html).toContain("Reconcile &lt;bank&gt; accounts");
    expect(html).not.toContain("<bank>");
    expect(html).toMatch(/Done/);
    expect(html).toContain("Assess late fees");
    expect(html).toContain("Nov 6");
    expect(html).toContain("#4567");
    expect(html).toContain("Roof leak");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("$1,250");
    expect(html).toMatch(/3 payments.*\$1,600/);
    expect(html).toContain("Rentvine payments");
    expect(html).toContain("https://pmilighthouse.app/calendar");
  });

  it("says so when there's nothing, and leaves out the draws line when it couldn't be checked", () => {
    const empty: DailySummaryData = { ...DATA, dueToday: [], overdue: [], workOrders: [], returnedPayments: [], draws: null, syncProblems: [] };
    const { subject, html } = buildDailySummary(empty, "https://pmilighthouse.app");
    expect(subject).toBe("PM Central daily summary · Wed, Nov 18 · nothing due");
    expect(html).toContain("Nothing due today");
    expect(html).toContain("No alerts");
    expect(html).not.toMatch(/ready to batch/);
  });
});

describe("isSummaryTime", () => {
  it("is the 6am Eastern hour on a business day, winter or summer", () => {
    expect(isSummaryTime(new Date("2026-11-18T11:00:00Z"))).toBe(true); // 6am EST, Wed
    expect(isSummaryTime(new Date("2026-11-18T10:00:00Z"))).toBe(false); // 5am EST
    expect(isSummaryTime(new Date("2026-07-15T10:00:00Z"))).toBe(true); // 6am EDT, Wed
    expect(isSummaryTime(new Date("2026-07-15T11:00:00Z"))).toBe(false); // 7am EDT
  });

  it("not on weekends or bank holidays", () => {
    expect(isSummaryTime(new Date("2026-11-21T11:00:00Z"))).toBe(false); // Saturday
    expect(isSummaryTime(new Date("2026-11-26T11:00:00Z"))).toBe(false); // Thanksgiving
  });
});

describe("parseRecipients", () => {
  it("takes a comma/space/semicolon list or an array, lower-cased and de-duplicated", () => {
    expect(parseRecipients(" Paul@PMI.com, ari@pmi.com; paul@pmi.com ")).toEqual({ ok: true, emails: ["paul@pmi.com", "ari@pmi.com"] });
    expect(parseRecipients(["a@b.co"])).toEqual({ ok: true, emails: ["a@b.co"] });
    expect(parseRecipients("")).toEqual({ ok: true, emails: [] });
  });

  it("rejects a bad address or too many", () => {
    expect(parseRecipients("paul@")).toMatchObject({ ok: false, error: expect.stringMatching(/paul@/) });
    expect(parseRecipients(Array.from({ length: 11 }, (_, i) => `u${i}@x.co`))).toMatchObject({ ok: false });
  });
});
