import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { POST } from "@/app/api/admin/refresh/route";
import { jsonResponse } from "../helpers/fetch";

const currentUser = vi.mocked(getCurrentUser);

const refresh = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/admin/refresh", { method: "POST", body: JSON.stringify(body) }));

let github: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("GITHUB_DISPATCH_TOKEN", "gh-token");
  currentUser.mockResolvedValue({ role: "admin" } as never);
  github = vi.fn(async () => ({ ...jsonResponse(null), status: 204 }));
  vi.stubGlobal("fetch", github);
});

describe("POST /api/admin/refresh", () => {
  it("is admin-only", async () => {
    currentUser.mockResolvedValue({ role: "staff" } as never);
    expect((await refresh({ source: "balances" })).status).toBe(403);

    currentUser.mockResolvedValue(null);
    expect((await refresh({ source: "balances" })).status).toBe(403);

    expect(github).not.toHaveBeenCalled();
  });

  it("returns 503 when the dispatch token isn't configured", async () => {
    vi.stubEnv("GITHUB_DISPATCH_TOKEN", "");
    expect((await refresh({ source: "balances" })).status).toBe(503);
  });

  it("rejects an unknown source", async () => {
    expect((await refresh({ source: "nope" })).status).toBe(400);
    expect((await refresh(null)).status).toBe(400);
  });

  it("dispatches the source's workflow", async () => {
    const res = await refresh({ source: "properties" });

    expect(res.status).toBe(200);
    expect(String(github.mock.calls[0][0])).toBe(
      "https://api.github.com/repos/pland10/PM-Central/actions/workflows/sync-rentvine.yml/dispatches"
    );
  });

  it("passes a GitHub failure back as an error", async () => {
    github.mockResolvedValue(jsonResponse({ message: "Bad credentials" }, { status: 401 }));

    const res = await refresh({ source: "properties" });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/HTTP 401/);
  });
});
