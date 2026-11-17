// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloseCalendar } from "@/app/(app)/calendar/CloseCalendar";
import type { CalendarEvent } from "@/lib/calendar/events";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 1, title: "Reimbursables review", description: "Bill every reimbursable", rule: "ME-5", frequency: "monthly", month: null,
  adjust: "prior", ownerEmail: "ari@pmi.com", ownerName: "Ari", active: true, ...over,
});
const EVENTS = [
  ev({}),
  ev({ id: 2, title: "Reconcile bank accounts", rule: "BD3", ownerEmail: null, ownerName: null }),
  ev({ id: 3, title: "Send 1099s", rule: "D31", frequency: "yearly", month: 1 }),
];
const STAFF = [{ name: "Ari", email: "ari@pmi.com" }, { name: "Paul", email: "paul@pmi.com" }];
const TODAY = "2026-11-17";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, status: { doneBy: "paul@pmi.com", doneByName: "Paul", doneAt: "2026-11-17T15:00:00.000Z" } }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const setup = (over: Partial<Parameters<typeof CloseCalendar>[0]> = {}) => {
  const user = userEvent.setup();
  render(<CloseCalendar initialEvents={EVENTS} initialStatuses={{}} staff={STAFF} today={TODAY} canEdit={false} {...over} />);
  return { user };
};
const taskRow = (eventId: number, period: string) => screen.getByLabelText(`done-${eventId}-${period}`).closest("li")!;

describe("CloseCalendar — the month's tasks", () => {
  it("lists this month's tasks by date, with rule, owner and overdue", () => {
    setup();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    const reimb = taskRow(1, "2026-11");
    expect(reimb).toHaveTextContent("Reimbursables review");
    expect(reimb).toHaveTextContent("ME-5");
    expect(reimb).toHaveTextContent("Wed, Nov 25");
    expect(reimb).toHaveTextContent("Ari");
    const recon = taskRow(2, "2026-11");
    expect(recon).toHaveTextContent("Wed, Nov 4");
    expect(recon).toHaveTextContent("Unassigned");
    expect(within(recon).getByText("Overdue")).toBeInTheDocument(); // past and not done
    expect(screen.queryByLabelText("done-3-2026-11")).not.toBeInTheDocument(); // yearly, January only
  });

  it("shows who checked a task off", () => {
    setup({ initialStatuses: { "2:2026-11": { doneBy: "ari@pmi.com", doneByName: "Ari", doneAt: "2026-11-04T15:00:00.000Z" } } });
    const recon = taskRow(2, "2026-11");
    expect(screen.getByLabelText("done-2-2026-11")).toBeChecked();
    expect(recon).toHaveTextContent("Done by Ari");
    expect(within(recon).queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("checks a task off and records it", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("done-1-2026-11"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/calendar/status");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ eventId: 1, period: "2026-11", done: true });
    expect(await within(taskRow(1, "2026-11")).findByText(/Done by Paul/)).toBeInTheDocument();
  });

  it("moves between months", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    expect(taskRow(3, "2027-01")).toHaveTextContent("Fri, Jan 29"); // Jan 31 is a Sunday
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });
});

describe("CloseCalendar — managing events", () => {
  it("hides editing from non-admins", () => {
    setup();
    expect(screen.queryByRole("button", { name: "+ Add event" })).not.toBeInTheDocument();
  });

  it("adds an event with a live preview of the rule", async () => {
    const created = ev({ id: 9, title: "Pay vendors", rule: "ME-2BD", ownerEmail: "paul@pmi.com", ownerName: "Paul", description: "" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ event: created }) });
    const { user } = setup({ canEdit: true });
    await user.click(screen.getByRole("button", { name: "+ Add event" }));
    await user.type(screen.getByLabelText("Name"), "Pay vendors");
    await user.type(screen.getByLabelText("Date rule"), "me-2bd");
    expect(screen.getByText(/2 business days before month end/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Thu, Nov 26|Next: Wed, Nov 25/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Owner"), "paul@pmi.com");
    await user.click(screen.getByRole("button", { name: "Save event" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/calendar/events");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ title: "Pay vendors", rule: "me-2bd", frequency: "monthly", adjust: "prior", ownerEmail: "paul@pmi.com" });
    expect(await screen.findByLabelText("done-9-2026-11")).toBeInTheDocument();
  });

  it("won't save a rule it can't read", async () => {
    const { user } = setup({ canEdit: true });
    await user.click(screen.getByRole("button", { name: "+ Add event" }));
    await user.type(screen.getByLabelText("Name"), "Thing");
    await user.type(screen.getByLabelText("Date rule"), "soon");
    expect(screen.getByText(/isn't a date rule/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save event" })).toBeDisabled();
  });

  it("edits an existing event", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ event: { ...EVENTS[0], rule: "ME-3" } }) });
    const { user } = setup({ canEdit: true });
    await user.click(screen.getByRole("button", { name: "edit-event-1" }));
    const rule = screen.getByLabelText("Date rule");
    expect(rule).toHaveValue("ME-5");
    await user.clear(rule);
    await user.type(rule, "ME-3");
    await user.click(screen.getByRole("button", { name: "Save event" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/calendar/events/1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(await within(taskRow(1, "2026-11")).findByText("ME-3")).toBeInTheDocument();
  });
});

describe("CloseCalendar — every business day", () => {
  const DAILY = ev({ id: 7, title: "Check bank feed", rule: "DAILY", frequency: "daily" });

  it("lists only today's occurrence of a daily task, checked off by the day", async () => {
    const { user } = setup({ initialEvents: [DAILY] });
    expect(screen.getByLabelText("done-7-2026-11-17")).toBeInTheDocument();
    expect(screen.queryByLabelText("done-7-2026-11-16")).not.toBeInTheDocument();
    expect(taskRow(7, "2026-11-17")).toHaveTextContent("Daily");
    await user.click(screen.getByLabelText("done-7-2026-11-17"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ eventId: 7, period: "2026-11-17", done: true });
  });

  it("switching an event to every business day hides the date rule and saves DAILY", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ event: { ...EVENTS[0], rule: "DAILY", frequency: "daily" } }) });
    const { user } = setup({ canEdit: true });
    await user.click(screen.getByRole("button", { name: "edit-event-1" }));
    await user.selectOptions(screen.getByLabelText("Repeats"), "daily");
    expect(screen.queryByLabelText("Date rule")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Weekends & holidays")).not.toBeInTheDocument();
    expect(screen.getByText(/Every business day · Next: Tue, Nov 17, Wed, Nov 18, Thu, Nov 19/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save event" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ frequency: "daily", rule: "DAILY", month: null });
  });
});
