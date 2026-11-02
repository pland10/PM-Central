import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/config/data-sources";
import { activeRun, latestRunState } from "@/lib/dispatch";
import { jsonResponse } from "../helpers/fetch";

const SINCE = new Date("2026-11-01T17:00:00Z");
const run = (over: Record<string, unknown>) => ({
  id: 1,
  status: "completed",
  conclusion: "success",
  created_at: "2026-11-01T17:00:05Z",
  run_started_at: "2026-11-01T17:00:06Z",
  html_url: "https://github.com/pland10/leadsimple-search/actions/runs/1",
  ...over,
});

let github: ReturnType<typeof vi.fn>;
const answer = (runs: unknown[]) => github.mockResolvedValue(jsonResponse({ workflow_runs: runs }));

beforeEach(() => {
  vi.stubEnv("GITHUB_DISPATCH_TOKEN", "gh-token");
  github = vi.fn();
  vi.stubGlobal("fetch", github);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const workOrders = getDataSource("work_orders")!;

describe("latestRunState", () => {
  it("asks GitHub for the source workflow's recent runs on its branch (any trigger)", async () => {
    answer([]);
    await latestRunState(workOrders, SINCE);
    const url = new URL(String(github.mock.calls[0][0]));
    expect(url.pathname).toBe("/repos/pland10/leadsimple-search/actions/workflows/sync.yml/runs");
    expect(url.searchParams.get("event")).toBeNull(); // scheduled runs refresh the data too
    expect(url.searchParams.get("branch")).toBe("master");
  });

  it("is pending until the run shows up", async () => {
    answer([run({ created_at: "2026-11-01T16:40:00Z" })]); // an older run, not ours
    expect(await latestRunState(workOrders, SINCE)).toEqual({ state: "pending" });
  });

  it("maps queued / in progress / success / failure", async () => {
    answer([run({ status: "queued", conclusion: null })]);
    expect((await latestRunState(workOrders, SINCE)).state).toBe("queued");
    answer([run({ status: "in_progress", conclusion: null })]);
    expect((await latestRunState(workOrders, SINCE)).state).toBe("running");
    answer([run({})]);
    expect(await latestRunState(workOrders, SINCE)).toEqual({
      state: "success",
      url: "https://github.com/pland10/leadsimple-search/actions/runs/1",
      startedAt: "2026-11-01T17:00:06Z",
    });
    answer([run({ conclusion: "failure" })]);
    expect((await latestRunState(workOrders, SINCE)).state).toBe("failure");
  });

  it("follows the first run after the click, not a later click's run on the same workflow", async () => {
    // Work orders clicked at 17:00, then Payments (same sync.yml) at 17:00:30.
    // Work orders' own run finished; it must not wait on the Payments run.
    answer([
      run({ id: 2, status: "queued", conclusion: null, created_at: "2026-11-01T17:00:30Z" }),
      run({ id: 1, created_at: "2026-11-01T17:00:05Z" }),
    ]);
    expect((await latestRunState(workOrders, SINCE)).state).toBe("success");
  });

  it("does not adopt a run created well before the click", async () => {
    // A run from 30s before the click is someone else's, not this click's.
    answer([run({ created_at: "2026-11-01T16:59:30Z", status: "in_progress", conclusion: null })]);
    expect(await latestRunState(workOrders, SINCE)).toEqual({ state: "pending" });
  });

  it("reports an error when GitHub refuses", async () => {
    github.mockResolvedValue(jsonResponse({ message: "Bad credentials" }, { status: 401 }));
    expect((await latestRunState(workOrders, SINCE)).state).toBe("error");
  });
});

describe("activeRun", () => {
  it("finds a run already queued or running (from anyone), for picking up after a reload", async () => {
    answer([
      run({ id: 3, status: "pending", conclusion: null, created_at: "2026-11-01T17:20:28Z" }),
      run({ id: 2, status: "in_progress", conclusion: null, created_at: "2026-11-01T17:17:27Z" }),
      run({ id: 1, created_at: "2026-11-01T17:05:12Z" }),
    ]);
    // The oldest active run finishes first, so follow it — the status then
    // updates as each run lands instead of only after the last.
    expect(await activeRun(workOrders)).toEqual({ state: "running", since: "2026-11-01T17:17:27Z" });
  });

  it("treats pending/waiting runs as queued", async () => {
    answer([run({ status: "pending", conclusion: null, created_at: "2026-11-01T17:20:28Z" }), run({})]);
    expect(await activeRun(workOrders)).toEqual({ state: "queued", since: "2026-11-01T17:20:28Z" });
  });

  it("says running when the active run has started", async () => {
    answer([run({ status: "in_progress", conclusion: null, created_at: "2026-11-01T17:17:27Z" }), run({})]);
    expect(await activeRun(workOrders)).toEqual({ state: "running", since: "2026-11-01T17:17:27Z" });
  });

  it("is idle when nothing is queued or running", async () => {
    answer([run({})]);
    expect(await activeRun(workOrders)).toEqual({ state: "idle" });
  });
});
