// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshButton } from "@/app/(app)/admin/data/RefreshButton";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;
let states: unknown[];

beforeEach(() => {
  states = [];
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).startsWith("/api/admin/refresh/status")) return ok(states.shift() ?? { state: "running" });
    return ok({ ok: true }); // the dispatch POST
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RefreshButton", () => {
  it("shows the run going from queued to running to done, then refreshes the page", async () => {
    states = [{ state: "pending" }, { state: "queued" }, { state: "running" }, { state: "success" }];
    render(<RefreshButton source="work_orders" pollMs={5} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/refresh");
    expect(await screen.findByText(/running/i)).toBeTruthy();
    expect(await screen.findByText(/done/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalled(); // reloads "Last refreshed"
    const statusUrl = new URL(String(fetchMock.mock.calls[1][0]), "https://x");
    expect(statusUrl.searchParams.get("source")).toBe("work_orders");
    expect(statusUrl.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("shows a failed run with a link to its log", async () => {
    states = [{ state: "failure", url: "https://github.com/x/runs/9" }];
    render(<RefreshButton source="work_orders" pollMs={5} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));

    const link = await screen.findByRole("link", { name: /failed/i });
    expect(link.getAttribute("href")).toBe("https://github.com/x/runs/9");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables the button while a run is in progress", async () => {
    states = [{ state: "running" }, { state: "running" }, { state: "running" }];
    render(<RefreshButton source="work_orders" pollMs={50} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));
    await screen.findByText(/running/i);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
