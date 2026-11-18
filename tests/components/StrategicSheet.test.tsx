// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategicSheet, type StrategicSection } from "@/app/(app)/meetings/strategic/StrategicSheet";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const sections: StrategicSection[] = [
  {
    id: 1,
    title: "Growth",
    topics: [
      { id: 10, title: "Hiring a PM", note: "", lastNote: { date: "2026-11-10", body: "posted the ad" } },
      { id: 11, title: "Owner retention", note: "", lastNote: null },
    ],
  },
];

describe("StrategicSheet", () => {
  it("renders sections and topics with last-meeting context", () => {
    render(<StrategicSheet date="2026-11-17" dateOptions={["2026-11-17", "2026-11-10"]} sections={sections} canManage />);
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Hiring a PM")).toBeInTheDocument();
    expect(screen.getByText(/Last meeting .*posted the ad/)).toBeInTheDocument();
  });

  it("saves a topic note on blur with topicId + date", async () => {
    const user = userEvent.setup();
    render(<StrategicSheet date="2026-11-17" dateOptions={["2026-11-17"]} sections={sections} canManage={false} />);
    await user.type(screen.getByLabelText("Notes for Hiring a PM"), "offer accepted");
    await user.tab();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ topicId: 10, date: "2026-11-17", body: "offer accepted" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows an empty state with an admin link when there's no agenda", () => {
    render(<StrategicSheet date="2026-11-17" dateOptions={["2026-11-17"]} sections={[]} canManage />);
    expect(screen.getByText(/No agenda yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add sections and topics/ })).toHaveAttribute("href", "/admin/meeting-topics");
  });
});
