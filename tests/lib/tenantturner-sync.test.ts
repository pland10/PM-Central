import { describe, expect, it, vi } from "vitest";
import {
  TT_OVERLAP_MS,
  lowerKeys,
  runTenantTurnerSync,
  showingsFromApplication,
  type TtSyncDeps,
} from "@/lib/tenantturner/sync";

// The live API returns PascalCase; the OpenAPI spec says camelCase. Either works.
const APP = {
  ApplicationId: 501,
  PropertyId: 77,
  FirstName: "Ann",
  LastName: "Lee",
  Email: "ann@example.com",
  Phone: "555-0100",
  MoveIn: "2026-12-01",
  AcquisitionSource: "Zillow",
  DateCreated: "2026-11-03T14:00:00Z",
  Comments: "Is the basement finished?",
  IsQualified: true,
  Questions: [
    { Question: "Do you have pets?", Answer: "One cat", IsKnockout: false },
    { Question: "Monthly income?", Answer: "  ", IsKnockout: true },
    { Question: "", Answer: "orphan answer" },
  ],
  Showings: [
    {
      ShowingId: 9001,
      Status: "Confirmed",
      ViewingType: "Self-Access",
      StartTime: "2026-11-05T15:00:00Z",
      RequestedTime1: "2026-11-05T15:00:00Z",
      DateCreated: "2026-11-03T14:05:00Z",
      CodeSent: "2026-11-05T14:30:00Z",
      Code: "4321",
      Message: "Lockbox is on the side door",
      User: { Name: "Sam Agent", Email: "sam@pmi.com", Phone: "555-0199" },
      ShowingFeedback: { Rating: 4, Comments: "Liked the yard" },
    },
    { ShowingId: 9002, Status: "Cancelled" },
    { Status: "no id — skipped" },
  ],
};
const PROP = { PropertyId: 77, Address: "66 Francis Ct", City: "Elmont", State: "NY", ZipCode: "11003" };

describe("lowerKeys", () => {
  it("lower-cases keys so either casing reads the same", () => {
    expect(lowerKeys({ ShowingId: 1, nextPage: "x" })).toEqual({ showingid: 1, nextpage: "x" });
    expect(lowerKeys(null)).toEqual({});
  });
});

describe("showingsFromApplication", () => {
  it("maps each showing with the lead, agent, feedback and the property's address", () => {
    const [first, second] = showingsFromApplication(lowerKeys(APP), lowerKeys(PROP));
    expect(first).toEqual({
      externalId: "9001",
      status: "confirmed",
      viewingType: "Self-Access",
      startTime: new Date("2026-11-05T15:00:00Z"),
      requestedTime1: new Date("2026-11-05T15:00:00Z"),
      requestedTime2: undefined,
      requestedTime3: undefined,
      leadSubmittedAt: new Date("2026-11-03T14:00:00Z"),
      bookedAt: new Date("2026-11-03T14:05:00Z"),
      leadName: "Ann Lee",
      leadEmail: "ann@example.com",
      leadPhone: "555-0100",
      moveIn: "2026-12-01",
      acquisitionSource: "Zillow",
      agentName: "Sam Agent",
      agentEmail: "sam@pmi.com",
      agentPhone: "555-0199",
      feedbackRating: 4,
      feedbackComments: "Liked the yard",
      lockboxCodeSentAt: new Date("2026-11-05T14:30:00Z"),
      leadComments: "Is the basement finished?",
      leadQualified: true,
      leadQuestions: [{ question: "Do you have pets?", answer: "One cat" }],
      showingMessage: "Lockbox is on the side door",
      ttPropertyId: "77",
      ttAddress: "66 Francis Ct",
      ttCity: "Elmont",
      ttState: "NY",
      ttZip: "11003",
    });
    expect(second).toMatchObject({ externalId: "9002", status: "cancelled", leadName: "Ann Lee" });
  });

  it("never keeps the lockbox code, and leaves pre-screen fields out when Tenant Turner sent none", () => {
    const [first] = showingsFromApplication(lowerKeys(APP), lowerKeys(PROP));
    expect(JSON.stringify(first)).not.toContain("4321");
    const bare = lowerKeys({ ApplicationId: 1, Showings: [{ ShowingId: 5, Status: "Scheduled" }] });
    expect(showingsFromApplication(bare, undefined)[0]).toMatchObject({
      leadComments: undefined,
      leadQualified: undefined,
      leadQuestions: undefined,
      showingMessage: undefined,
    });
  });

  it("skips showings without an id, and still maps when the property is unknown", () => {
    const rows = showingsFromApplication(lowerKeys(APP), undefined);
    expect(rows.map((r) => r.externalId)).toEqual(["9001", "9002"]);
    expect(rows[0]).toMatchObject({ ttPropertyId: "77", ttAddress: undefined });
  });

  it("defaults an unrecognized status to scheduled", () => {
    const app = lowerKeys({ ...APP, Showings: [{ ShowingId: 1, Status: "Weird" }] });
    expect(showingsFromApplication(app, undefined)[0].status).toBe("scheduled");
  });
});

function deps(over: Partial<TtSyncDeps> = {}) {
  const saved: string[] = [];
  const upserts: string[] = [];
  const d: TtSyncDeps = {
    loadSince: vi.fn(async () => "2026-11-10T00:00:00.000Z"),
    saveSince: vi.fn(async (iso: string) => void saved.push(iso)),
    listProperties: vi.fn(async () => [lowerKeys(PROP)]),
    listChangedApplications: vi.fn(async () => [lowerKeys(APP)]),
    getApplication: vi.fn(async () => lowerKeys(APP)),
    upsertShowing: vi.fn(async (s) => {
      upserts.push(s.externalId);
      return { linked: s.externalId === "9001" };
    }),
    defaultSince: "2026-11-01T00:00:00.000Z",
    now: () => new Date("2026-11-18T22:00:00.000Z"),
    ...over,
  };
  return { d, saved, upserts };
}

describe("runTenantTurnerSync", () => {
  it("upserts the showings of every application changed since the last run, then moves the checkpoint", async () => {
    const { d, saved, upserts } = deps();
    const out = await runTenantTurnerSync(d);
    expect(d.listChangedApplications).toHaveBeenCalledWith("2026-11-10T00:00:00.000Z");
    expect(d.getApplication).not.toHaveBeenCalled(); // the list already carried the showings
    expect(upserts).toEqual(["9001", "9002"]);
    // Next run starts a little before this one began, so nothing slips through.
    expect(saved).toEqual([new Date(Date.parse("2026-11-18T22:00:00.000Z") - TT_OVERLAP_MS).toISOString()]);
    expect(out).toEqual({ since: "2026-11-10T00:00:00.000Z", applications: 1, showings: 2, linked: 1, failed: 0 });
  });

  it("keeps only showings dated on or after the cutoff (an old lead touched recently brings old showings)", async () => {
    const app = lowerKeys({
      ...APP,
      Showings: [
        { ShowingId: 1, Status: "Confirmed", StartTime: "2026-08-08T17:00:00Z" }, // August — dropped
        { ShowingId: 2, Status: "Requested", RequestedTime1: "2026-11-02T15:00:00Z" }, // no start yet, requested in Nov
        { ShowingId: 3, Status: "Scheduled", StartTime: "2026-11-01T00:00:00Z" }, // right on the cutoff
        { ShowingId: 4, Status: "Requested", DateCreated: "2026-10-30T12:00:00Z" }, // only a booked date, before the cutoff
        { ShowingId: 5, Status: "Requested" }, // no date at all — kept
      ],
    });
    const { d, upserts } = deps({ listChangedApplications: vi.fn(async () => [app]), showingsFrom: "2026-11-01T00:00:00.000Z" });
    const out = await runTenantTurnerSync(d);
    expect(upserts).toEqual(["2", "3", "5"]);
    expect(out.showings).toBe(3);
  });

  it("starts from the default date the first time", async () => {
    const { d } = deps({ loadSince: vi.fn(async () => null) });
    await runTenantTurnerSync(d);
    expect(d.listChangedApplications).toHaveBeenCalledWith("2026-11-01T00:00:00.000Z");
  });

  it("an explicit start date wins (the backfill)", async () => {
    const { d } = deps({ sinceOverride: "2026-11-01T00:00:00.000Z" });
    await runTenantTurnerSync(d);
    expect(d.listChangedApplications).toHaveBeenCalledWith("2026-11-01T00:00:00.000Z");
  });

  it("fetches the application when the list didn't include its showings", async () => {
    const { Showings: _omit, ...bare } = APP;
    const { d, upserts } = deps({ listChangedApplications: vi.fn(async () => [lowerKeys(bare)]) });
    await runTenantTurnerSync(d);
    expect(d.getApplication).toHaveBeenCalledWith("501");
    expect(upserts).toEqual(["9001", "9002"]);
  });

  it("keeps the checkpoint where it was when an application couldn't be read, so it's retried", async () => {
    const { Showings: _omit, ...bare } = APP;
    const { d, saved } = deps({
      listChangedApplications: vi.fn(async () => [lowerKeys(bare)]),
      getApplication: vi.fn(async () => {
        throw new Error("HTTP 500");
      }),
    });
    const out = await runTenantTurnerSync(d);
    expect(out.failed).toBe(1);
    expect(saved).toEqual([]);
  });

  it("reports the field names it sees (names only) when asked", async () => {
    const onFields = vi.fn();
    const { d } = deps({ onFields });
    await runTenantTurnerSync(d);
    const [appKeys, showingKeys] = onFields.mock.calls[0];
    expect(appKeys).toEqual(expect.arrayContaining(["applicationid", "showings", "email"]));
    expect(showingKeys).toEqual(expect.arrayContaining(["showingid", "status", "user"]));
  });
});
