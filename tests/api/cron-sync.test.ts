import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/cron/sync/route";
import { jsonResponse } from "../helpers/fetch";

const SECRET = "cron-secret-value";

function call(query: string, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return GET(new NextRequest(`https://pmilighthouse.app/api/cron/sync${query}`, { headers }));
}

let github: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("GITHUB_DISPATCH_TOKEN", "gh-token");
  github = vi.fn(async () => ({ ...jsonResponse(null), status: 204 }));
  vi.stubGlobal("fetch", github);
});

const dispatchedWorkflows = () =>
  github.mock.calls.map(([url]) => String(url).replace("https://api.github.com/repos/", "").replace("/dispatches", ""));

describe("/api/cron/sync", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await call("?tier=hourly", {})).status).toBe(401);
    expect((await call("?tier=hourly", { authorization: "Bearer wrong" })).status).toBe(401);
    expect(github).not.toHaveBeenCalled();
  });

  it("stays locked when CRON_SECRET isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("?tier=hourly&key=")).status).toBe(401);
  });

  it("accepts the secret as ?key= for simple pingers", async () => {
    const res = await call(`?source=balances&key=${SECRET}`, {});
    expect(res.status).toBe(200);
  });

  it("dispatches each hourly workflow once even when several sources share it", async () => {
    const res = await call("?tier=hourly");

    expect(res.status).toBe(200);
    expect(dispatchedWorkflows().sort()).toEqual([
      "pland10/leadsimple-search/actions/workflows/backfill.yml",
      "pland10/leadsimple-search/actions/workflows/sync.yml",
    ]);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("dispatches the daily PM-Central syncs on main", async () => {
    await call("?tier=daily");

    expect(dispatchedWorkflows().sort()).toEqual([
      "pland10/PM-Central/actions/workflows/sync-balances.yml",
      "pland10/PM-Central/actions/workflows/sync-rentvine.yml",
    ]);
    const [, init] = github.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main" });
    expect(init.headers.Authorization).toBe("Bearer gh-token");
  });

  it("skips self-scheduled sources in the tier sweep, but still dispatches them by id", async () => {
    // Plaid (bank_transactions) has its own daily GitHub cron, so the daily
    // sweep must not double-run it…
    await call("?tier=daily");
    expect(dispatchedWorkflows()).not.toContain("pland10/PM-Central/actions/workflows/sync-plaid.yml");

    // …but an explicit refresh of it still fires, with mode=sync.
    github.mockClear();
    await call(`?source=bank_transactions&key=${SECRET}`, {});
    expect(dispatchedWorkflows()).toEqual(["pland10/PM-Central/actions/workflows/sync-plaid.yml"]);
    expect(JSON.parse(String(github.mock.calls[0][1].body))).toEqual({ ref: "main", inputs: { mode: "sync" } });
  });

  it("dispatches a single named source", async () => {
    await POST(
      new NextRequest("https://pmilighthouse.app/api/cron/sync?source=balances", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      })
    );
    expect(dispatchedWorkflows()).toEqual(["pland10/PM-Central/actions/workflows/sync-balances.yml"]);
  });

  it("rejects an unknown source or a missing tier with 400", async () => {
    expect((await call("?source=nope")).status).toBe(400);
    expect((await call("")).status).toBe(400);
    expect((await call("?tier=weekly")).status).toBe(400);
  });

  it("reports 502 when GitHub refuses the dispatch", async () => {
    github.mockResolvedValue(jsonResponse({ message: "Resource not accessible" }, { status: 403 }));

    const res = await call("?source=balances");

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.dispatched[0].error).toMatch(/HTTP 403/);
  });
});
