// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingTopicsManager } from "@/app/(app)/admin/meeting-topics/MeetingTopicsManager";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let fetchMock: ReturnType<typeof vi.fn>;
let nextId = 100;
beforeEach(() => {
  nextId = 100;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: nextId++ }) }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const initial = [{ id: 1, title: "Growth", topics: [{ id: 10, title: "Hiring" }] }];

describe("MeetingTopicsManager", () => {
  it("adds a section via the API and shows it", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    await user.type(screen.getByLabelText("Add a section"), "Operations");
    await user.click(screen.getByRole("button", { name: "Add section" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/meeting-sections");
    expect(JSON.parse(init.body)).toEqual({ title: "Operations", date: "2026-12-01" });
    expect(await screen.findByDisplayValue("Operations")).toBeInTheDocument();
  });

  it("adds a topic under its section", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    await user.type(screen.getByLabelText("Add a topic to Growth"), "Marketing");
    await user.click(screen.getByRole("button", { name: "Add topic" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sectionId: 1, title: "Marketing", date: "2026-12-01" });
    expect(await screen.findByDisplayValue("Marketing")).toBeInTheDocument();
  });

  it("renames a topic on blur", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    const topic = screen.getByLabelText("Topic name for Hiring");
    await user.clear(topic);
    await user.type(topic, "Hiring a PM");
    await user.tab();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")!;
    expect(call[0]).toBe("/api/admin/meeting-topics");
    expect(JSON.parse(call[1].body)).toEqual({ id: 10, title: "Hiring a PM", date: "2026-12-01" });
  });

  it("deletes a topic", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE")!;
    expect(call[0]).toBe("/api/admin/meeting-topics?id=10&date=2026-12-01");
    expect(screen.queryByDisplayValue("Hiring")).not.toBeInTheDocument();
  });

  it("deletes a section (after confirm)", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    await user.click(screen.getByRole("button", { name: "Delete section" }));
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE")!;
    expect(call[0]).toBe("/api/admin/meeting-sections?id=1&date=2026-12-01");
    expect(screen.queryByDisplayValue("Growth")).not.toBeInTheDocument();
  });

  it("edits the agenda for a chosen meeting week", async () => {
    const user = userEvent.setup();
    render(<MeetingTopicsManager initialSections={initial} date="2026-12-01" dateOptions={["2026-12-01", "2026-11-24"]} />);
    expect(screen.getByText(/earlier weeks keep their own agenda/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Meeting date"), "2026-11-24");
    expect(push).toHaveBeenCalledWith("/admin/meeting-topics?date=2026-11-24");
  });
});
