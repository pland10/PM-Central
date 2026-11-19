// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ShowingsTable, type ShowingRow } from "@/app/(app)/showings/ShowingsTable";

const row = (over: Partial<ShowingRow> = {}): ShowingRow => ({
  id: "s1",
  status: "scheduled",
  viewingType: "Self-Access",
  startTime: "2099-01-05T15:00:00.000Z",
  address: "66 Francis Ct · Elmont, NY 11003",
  propertyId: null,
  leadName: "Ann Lee",
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
  leadComments: null,
  leadQualified: null,
  leadQuestions: [],
  showingMessage: null,
  updatedAt: "2026-11-18T00:00:00.000Z",
  ...over,
});

describe("ShowingsTable pre-screen", () => {
  it("shows qualified yes/no and the lead's comment, with the full pre-screen in a popup", async () => {
    const user = userEvent.setup();
    render(
      <ShowingsTable
        rows={[
          row({
            leadQualified: true,
            leadComments: "Is the basement finished?",
            leadQuestions: [{ question: "Do you have pets?", answer: "One cat" }],
            showingMessage: "Lockbox is on the side door",
          }),
          row({ id: "s2", leadName: "Bo", leadQualified: false }),
          row({ id: "s3", leadName: "Cy" }),
        ]}
      />
    );
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Not qualified")).toBeInTheDocument();
    expect(screen.getByText("Is the basement finished?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pre-screen for Ann Lee" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Do you have pets?")).toBeInTheDocument();
    expect(within(dialog).getByText("One cat")).toBeInTheDocument();
    expect(within(dialog).getByText("Lockbox is on the side door")).toBeInTheDocument();
    expect(within(dialog).getByText("Is the basement finished?")).toBeInTheDocument();

    // Nothing to open for a lead with no pre-screen details.
    expect(screen.queryByRole("button", { name: "Pre-screen for Cy" })).toBeNull();
  });

  it("fits more in fewer columns: type under status, dates under the lead, agent under the source", () => {
    render(
      <ShowingsTable
        rows={[
          row({
            viewingType: "Self-Access",
            leadEmail: "ann@example.com",
            leadSubmittedAt: "2026-11-03T14:00:00.000Z",
            moveIn: "2026-12-01",
            acquisitionSource: "Zillow",
            agentName: "Sam Agent",
          }),
        ]}
      />
    );
    for (const h of ["Submitted", "Move-in", "Type", "Agent"]) expect(screen.queryByRole("columnheader", { name: new RegExp(`^${h}`) })).toBeNull();
    expect(screen.getByText("Self-access")).toBeInTheDocument();
    expect(screen.getByText(/Submitted Nov 3, 2026 · Move-in/)).toBeInTheDocument();
    expect(screen.getByText("Zillow")).toBeInTheDocument();
    expect(screen.getByText("Sam Agent")).toBeInTheDocument();
  });

  describe("lead replies from Tenant Turner", () => {
    const msgs = [
      { id: "m2", receivedAt: "2026-11-19T13:39:41.000Z", leadName: "ann lee", agentName: "Paul", text: "Got it. Thanks for sending" },
      { id: "m1", receivedAt: "2026-11-19T13:32:56.000Z", leadName: "Ann Lee", agentName: "Paul", text: "Via text apparently" },
      { id: "m0", receivedAt: "2026-11-18T21:26:22.000Z", leadName: null, agentName: "Paul", text: "We found another rental" },
    ];

    it("shows a lead's replies under their name, the full conversation in a popup", async () => {
      const user = userEvent.setup();
      render(<ShowingsTable rows={[row(), row({ id: "s2", leadName: "Bo" })]} messages={msgs} />);
      const btn = screen.getByRole("button", { name: "2 replies from Ann Lee" });
      expect(btn).toHaveTextContent("Got it. Thanks for sending");
      expect(screen.queryByRole("button", { name: /replies? from Bo/ })).toBeNull();

      await user.click(btn);
      const dialog = screen.getByRole("dialog");
      const texts = within(dialog).getAllByTestId("reply-text").map((n) => n.textContent);
      expect(texts).toEqual(["Via text apparently", "Got it. Thanks for sending"]); // oldest first
    });

    it("lists the latest replies above the table, including unknown leads", () => {
      render(<ShowingsTable rows={[row()]} messages={msgs} />);
      const recent = screen.getByRole("region", { name: "Recent lead replies" });
      expect(within(recent).getByText("We found another rental")).toBeInTheDocument();
      expect(within(recent).getByText("Unknown lead")).toBeInTheDocument();
      expect(within(recent).getAllByText(/Ann Lee/i).length).toBeGreaterThan(0);
    });

    it("shows nothing extra when there are no replies", () => {
      render(<ShowingsTable rows={[row()]} />);
      expect(screen.queryByRole("region", { name: "Recent lead replies" })).toBeNull();
    });
  });
});
