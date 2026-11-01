import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/config/data-sources";
import { latestRunState } from "@/lib/dispatch";
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
  it("asks GitHub for the source workflow's recent manual runs on its branch", async () => {
    answer([]);
    await latestRunState(workOrders, SINCE);
    const url = new URL(String(github.mock.calls[0][0]));
    expect(url.pathname).toBe("/repos/pland10/leadsimple-search/actions/workflows/sync.yml/runs");
    expect(url.searchParams.get("event")).toBe("workflow_dispatch");
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

  it("picks the newest run started after the click", async () => {
    answer([
      run({ id: 2, status: "in_progress", conclusion: null, created_at: "2026-11-01T17:00:30Z" }),
      run({ id: 1, created_at: "2026-11-01T17:00:05Z" }),
    ]);
    expect((await latestRunState(workOrders, SINCE)).state).toBe("running");
  });

  it("reports an error when GitHub refuses", async () => {
    github.mockResolvedValue(jsonResponse({ message: "Bad credentials" }, { status: 401 }));
    expect((await latestRunState(workOrders, SINCE)).state).toBe("error");
  });
});
