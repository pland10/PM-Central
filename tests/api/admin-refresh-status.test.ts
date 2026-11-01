import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/dispatch", () => ({ latestRunState: vi.fn(), activeRun: vi.fn(), hasDispatchToken: vi.fn(() => true) }));

import { getCurrentUser } from "@/lib/auth/supabase-server";
import { activeRun, latestRunState } from "@/lib/dispatch";
import { GET } from "@/app/api/admin/refresh/status/route";

const get = (qs: string) => GET(new NextRequest(`https://pmilighthouse.app/api/admin/refresh/status?${qs}`));

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ role: "admin" } as never);
  vi.mocked(latestRunState).mockResolvedValue({ state: "running" });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/admin/refresh/status", () => {
  it("is admin-only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ role: "user" } as never);
    expect((await get("source=work_orders&since=2026-11-01T17:00:00Z")).status).toBe(403);
    expect(latestRunState).not.toHaveBeenCalled();
  });

  it("rejects an unknown source or a bad time", async () => {
    expect((await get("source=nope&since=2026-11-01T17:00:00Z")).status).toBe(400);
    expect((await get("source=work_orders&since=garbage")).status).toBe(400);
  });

  it("returns the state of the run started since the click", async () => {
    const res = await get("source=work_orders&since=2026-11-01T17:00:00Z");
    expect(await res.json()).toEqual({ state: "running" });
    const [src, since] = vi.mocked(latestRunState).mock.calls[0];
    expect(src.id).toBe("work_orders");
    expect((since as Date).toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("with active=1, reports a run already queued or running (no since needed)", async () => {
    vi.mocked(activeRun).mockResolvedValue({ state: "running", since: "2026-11-01T17:17:27Z" });
    const res = await get("source=work_orders&active=1");
    expect(await res.json()).toEqual({ state: "running", since: "2026-11-01T17:17:27Z" });
    expect(latestRunState).not.toHaveBeenCalled();
  });
});
