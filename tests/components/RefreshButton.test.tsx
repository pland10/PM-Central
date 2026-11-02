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
let active: unknown;

beforeEach(() => {
  states = [];
  active = { state: "idle" };
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("active=1")) return ok(active);
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

    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/admin/refresh");
    expect(await screen.findByText(/running/i)).toBeTruthy();
    expect(await screen.findByText(/done/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalled(); // reloads "Last refreshed"
    const statusUrl = new URL(
      String(fetchMock.mock.calls.map((c) => c[0]).find((u) => String(u).includes("since="))),
      "https://x"
    );
    expect(statusUrl.searchParams.get("source")).toBe("work_orders");
    expect(statusUrl.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("follows the run from the server's dispatch time, not the browser clock", async () => {
    const serverSince = "2026-11-02T11:25:04.000Z";
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("active=1")) return ok(active);
      if (String(url).startsWith("/api/admin/refresh/status")) return ok({ state: "success" });
      return ok({ ok: true, since: serverSince });
    });
    render(<RefreshButton source="work_orders" pollMs={5} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByText(/done/i)).toBeTruthy();
    const follow = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("since="))!;
    expect(new URL(follow, "https://x").searchParams.get("since")).toBe(serverSince);
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

  it("after a reload, picks up a run that's already going and follows it to done", async () => {
    // A recent start — a hardcoded wall-clock time would age past the
    // component's 20-minute GIVE_UP_MS and make this test fail by the clock.
    const since = new Date(Date.now() - 5_000).toISOString();
    active = { state: "running", since };
    states = [{ state: "running" }, { state: "success" }];
    render(<RefreshButton source="work_orders" pollMs={5} />);

    expect(await screen.findByText(/running/i)).toBeTruthy();
    expect(await screen.findByText(/done/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    const follow = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("since="))!;
    expect(new URL(follow, "https://x").searchParams.get("since")).toBe(since);
  });

  it("explains a queued run is waiting for the current one", async () => {
    const since = new Date(Date.now() - 5_000).toISOString();
    active = { state: "queued", since };
    states = [{ state: "queued" }, { state: "queued" }];
    render(<RefreshButton source="work_orders" pollMs={50} />);
    expect(await screen.findByText(/queued — waiting for the current run/i)).toBeTruthy();
  });

  it("keeps following a picked-up run even if it was created long ago (give-up counts from when watching began)", async () => {
    active = { state: "running", since: new Date(Date.now() - 2 * 60 * 60_000).toISOString() }; // 2 hours old
    states = [{ state: "running" }, { state: "success" }];
    render(<RefreshButton source="work_orders" pollMs={5} />);
    expect(await screen.findByText(/done/i)).toBeTruthy();
    expect(screen.queryByText(/check back later/i)).toBeNull();
  });
});
