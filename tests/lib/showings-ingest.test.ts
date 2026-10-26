import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { property: { findMany: vi.fn() }, showing: { upsert: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { applyTenantTurnerEvent } from "@/lib/showings";

const findMany = vi.mocked(prisma.property.findMany);
const upsert = vi.mocked(prisma.showing.upsert);

const event = (over: Record<string, unknown> = {}) => ({
  eventType: "Viewing Scheduled",
  eventDate: "2026-10-24T14:00:00Z",
  property: { propertyId: 555, address: "66 Francis Court.", city: "Elmont", state: "NY", zipCode: "11003-1234" },
  application: { firstName: "Jamie", lastName: "Lead", email: "jamie@example.com", phone: "+15550002" },
  showing: { showingId: 9001, status: "Scheduled", viewingType: "Self", startTime: "2026-10-25T15:00:00Z", user: { name: "Agent A" } },
  ...over,
});

const lastUpsert = () => upsert.mock.calls.at(-1)![0] as {
  where: unknown;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

beforeEach(() => {
  findMany.mockResolvedValue([
    { id: "prop-1", street1: "66 Francis Court" },
    { id: "prop-2", street1: "70 Francis Court" },
  ] as never);
  upsert.mockResolvedValue({} as never);
});

describe("applyTenantTurnerEvent", () => {
  it("ignores events that aren't about a showing", async () => {
    const result = await applyTenantTurnerEvent({ eventType: "Lead Created", application: {} });
    expect(result).toEqual({ ok: false, reason: 'No showingId on event "Lead Created".' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts idempotently on (source, showingId) and links the property by street + zip", async () => {
    const result = await applyTenantTurnerEvent(event());

    expect(result).toEqual({ ok: true, showingId: "9001", status: "scheduled", linked: true });
    const call = lastUpsert();
    expect(call.where).toEqual({ source_externalId: { source: "tenantturner", externalId: "9001" } });
    expect(call.update).toMatchObject({
      status: "scheduled",
      leadName: "Jamie Lead",
      leadEmail: "jamie@example.com",
      agentName: "Agent A",
      ttPropertyId: "555",
      ttZip: "11003-1234",
      propertyId: "prop-1",
      lastEventType: "Viewing Scheduled",
    });
    expect(call.update.startTime).toEqual(new Date("2026-10-25T15:00:00Z"));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { zip: { startsWith: "11003" } } }));
  });

  it("sets bookedAt only when creating the row", async () => {
    await applyTenantTurnerEvent(event());
    const call = lastUpsert();
    expect(call.create.bookedAt).toEqual(new Date("2026-10-24T14:00:00Z"));
    expect(call.update).not.toHaveProperty("bookedAt");
  });

  it("never clears an existing property link when no address matches", async () => {
    findMany.mockResolvedValue([] as never);

    const result = await applyTenantTurnerEvent(event());

    expect(result).toMatchObject({ linked: false });
    expect(lastUpsert().update).not.toHaveProperty("propertyId");
  });

  it("leaves lead details untouched on a partial event (Lockbox Code Sent)", async () => {
    await applyTenantTurnerEvent({
      eventType: "Lockbox Code Sent",
      codeSent: "2026-10-25T14:55:00Z",
      showing: { showingId: "9001" },
    });

    const { update, create } = lastUpsert();
    expect(update.lockboxCodeSentAt).toEqual(new Date("2026-10-25T14:55:00Z"));
    for (const field of ["leadName", "leadEmail", "leadPhone", "status", "propertyId", "ttAddress"]) {
      expect(update).not.toHaveProperty(field);
    }
    expect(create.status).toBe("scheduled"); // default for a brand-new row
  });

  it("records feedback rating and comments", async () => {
    await applyTenantTurnerEvent(event({ eventType: "Viewing Feedback", rating: "4", showingComments: "Loved the yard" }));
    expect(lastUpsert().update).toMatchObject({ status: "completed", feedbackRating: 4, feedbackComments: "Loved the yard" });
  });

  it.each([
    ["Cancelled", "Viewing Cancelled", "cancelled"],
    ["", "Viewing No Show", "no-show"],
    ["Confirmed", "Viewing Confirmed", "confirmed"],
    ["", "Viewing Feedback", "completed"],
    ["Requested", "Viewing Requested", "requested"],
    ["Scheduled", "Viewing Scheduled", "scheduled"],
  ])("normalizes status %j / event %j to %s", async (status, eventType, expected) => {
    const result = await applyTenantTurnerEvent(event({ eventType, showing: { showingId: 1, status } }));
    expect(result).toMatchObject({ status: expected });
  });

  it("does not link when the street matches but the zip doesn't", async () => {
    findMany.mockResolvedValue([] as never); // the zip filter excludes the candidate
    const result = await applyTenantTurnerEvent(event({ property: { address: "66 Francis Court", zipCode: "10001" } }));
    expect(result).toMatchObject({ linked: false });
  });

  it("ignores malformed fields instead of failing the event", async () => {
    const result = await applyTenantTurnerEvent({
      showing: { showingId: 7, startTime: "not a date", status: 42 },
      property: "not an object",
      rating: "five",
    });

    expect(result).toMatchObject({ ok: true, showingId: "7" });
    const { update } = lastUpsert();
    expect(update).not.toHaveProperty("startTime");
    expect(update).not.toHaveProperty("feedbackRating");
  });
});
