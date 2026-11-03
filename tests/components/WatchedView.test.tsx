// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WatchedView } from "@/app/(app)/invoicing/properties/WatchedView";

const watched = [{ id: "w1", address: "6 Harbor Ln, Glen Head, NY 11545", label: "Katerina Stella", source: "property", rentvinePropertyId: "70", isActive: true }];
const candidates = [
  { rentvinePropertyId: "70", address: "6 Harbor Ln, Glen Head, NY 11545", label: "Katerina Stella" },
  { rentvinePropertyId: "73", address: "47 Columbine Ave, Islip, NY 11751", label: "Columbine LLC" },
];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "w2" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("WatchedView", () => {
  it("adds a Rentvine property, marking ones already listed", async () => {
    const user = userEvent.setup();
    render(<WatchedView watched={watched} candidates={candidates} />);
    await user.click(screen.getByRole("button", { name: "+ Add property" }));
    expect(screen.getByText("already listed")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/Search Rentvine/), "columbine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      address: "47 Columbine Ave, Islip, NY 11751", label: "Columbine LLC", rentvinePropertyId: "73",
    });
  });

  it("takes a property out of the programme", async () => {
    render(<WatchedView watched={watched} candidates={candidates} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove from programme" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoicing/watched/w1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ isActive: false });
  });
});
