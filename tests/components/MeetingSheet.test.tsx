// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingSheet, type MeetingRow } from "@/app/(app)/meetings/MeetingSheet";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const row = (o: Partial<MeetingRow> & { id: string; label: string }): MeetingRow => ({
  address: `${o.label} addr`,
  active: true,
  tags: "",
  sortKey: o.label,
  note: "",
  lastNote: null,
  ...o,
});

const rentals = [
  row({ id: "r1", label: "1 Main St" }),
  row({ id: "r2", label: "9 Oak Ave", active: false, lastNote: { date: "2026-11-09", body: "leak fixed" } }),
];
const squatter = [row({ id: "s1", label: "5 Pine St" })];

function renderSheet() {
  render(
    <MeetingSheet date="2026-11-16" dateOptions={["2026-11-16", "2026-11-09"]} rentals={rentals} squatterWatch={squatter} removed={[]} />
  );
}

describe("MeetingSheet", () => {
  it("shows both sections with their houses, and last-meeting context", () => {
    renderSheet();
    expect(screen.getByText("Rental Units")).toBeInTheDocument();
    expect(screen.getByText("Squatter Watch")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("5 Pine St")).toBeInTheDocument();
    expect(screen.getByText(/Last meeting .*leak fixed/)).toBeInTheDocument();
  });

  it("saves a note to the API on blur, with the property + date", async () => {
    const user = userEvent.setup();
    renderSheet();
    const box = screen.getByLabelText("Notes for 1 Main St");
    await user.type(box, "roof needs a look");
    await user.tab(); // blur
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings/notes", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ propertyId: "r1", date: "2026-11-16", body: "roof needs a look" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("filters to active-only, hiding inactive houses", async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByText("9 Oak Ave")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "active" }));
    expect(screen.queryByText("9 Oak Ave")).not.toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
  });

  it("removes an INACTIVE house from the list via the API and refreshes", async () => {
    const user = userEvent.setup();
    renderSheet();
    const oakRow = screen.getByText("9 Oak Ave").closest("li")!; // r2 is inactive
    await user.click(within(oakRow).getByRole("button", { name: /remove from list/i }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ propertyId: "r2", removed: true });
    expect(refresh).toHaveBeenCalled();
  });

  it("does not offer Remove on an active house", () => {
    renderSheet();
    const mainRow = screen.getByText("1 Main St").closest("li")!; // r1 is active
    expect(within(mainRow).queryByRole("button", { name: /remove from list/i })).not.toBeInTheDocument();
  });

  it("collapses a section so its houses hide (to reach the other group)", async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Rental Units/ }));
    expect(screen.queryByText("1 Main St")).not.toBeInTheDocument(); // collapsed to the header row
    expect(screen.getByText("5 Pine St")).toBeInTheDocument(); // Squatter Watch still visible
  });

  it("changes the meeting date by navigating", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.selectOptions(screen.getByLabelText("Meeting date"), "2026-11-09");
    expect(push).toHaveBeenCalledWith("/meetings?date=2026-11-09");
  });
});
