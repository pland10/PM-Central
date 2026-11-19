import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { showing: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { listShowings } from "@/lib/showings";

afterEach(() => vi.clearAllMocks());

const base = {
  id: "s1",
  status: "scheduled",
  viewingType: null,
  startTime: null,
  requestedTime1: new Date("2026-11-20T15:00:00Z"),
  requestedTime2: new Date("2026-11-22T15:00:00Z"),
  requestedTime3: null,
  property: null,
  ttAddress: "66 Francis Ct",
  ttCity: "Elmont",
  ttState: "NY",
  ttZip: "11003",
  propertyId: null,
  leadName: "Ann",
  leadEmail: null,
  leadPhone: null,
  moveIn: null,
  leadSubmittedAt: null,
  bookedAt: null,
  agentName: null,
  acquisitionSource: null,
  feedbackRating: null,
  feedbackComments: null,
  lockboxCodeSentAt: null,
  updatedAt: new Date("2026-11-18T00:00:00Z"),
};

describe("listShowings pre-screen fields", () => {
  it("passes the comment, qualified flag, answers and showing message through", async () => {
    findMany.mockResolvedValue([
      {
        ...base,
        leadComments: "Is the basement finished?",
        leadQualified: false,
        leadQuestions: [{ question: "Pets?", answer: "One cat" }, { question: 3 }, "junk"],
        showingMessage: "Side door",
      },
    ]);
    const [r] = (await listShowings())!;
    expect(r).toMatchObject({
      leadComments: "Is the basement finished?",
      leadQualified: false,
      leadQuestions: [{ question: "Pets?", answer: "One cat" }],
      showingMessage: "Side door",
      requestedTime: "2026-11-22T15:00:00.000Z", // the latest time the lead asked for
    });
  });

  it("gives empty values when there's no pre-screen", async () => {
    findMany.mockResolvedValue([{ ...base, leadComments: null, leadQualified: null, leadQuestions: null, showingMessage: null }]);
    const [r] = (await listShowings())!;
    expect(r).toMatchObject({ leadComments: null, leadQualified: null, leadQuestions: [], showingMessage: null });
  });
});
