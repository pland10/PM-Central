import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search-db", () => ({ syncStatusRows: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { syncStatusRows } from "@/lib/search-db";
import { GET } from "@/app/api/search/status/route";

const rows = vi.mocked(syncStatusRows);
afterEach(() => vi.clearAllMocks());

const at = (iso: string | null) => (iso ? new Date(iso) : null);

describe("GET /api/search/status", () => {
  it("reports the oldest of the communication syncs only — not daily/weekly jobs or ones that never ran", async () => {
    rows.mockResolvedValue([
      { job: "tasks", last_run_at: at("2026-11-10T14:05:00Z"), detail: null },
      { job: "rentvine_chat", last_run_at: at("2026-11-10T14:06:00Z"), detail: null },
      { job: "activity_refresh", last_run_at: at("2026-11-10T13:10:00Z"), detail: null },
      { job: "rent_settlements", last_run_at: at("2026-11-10T14:07:00Z"), detail: null },
      // not communications: a weekly crawl and a daily Rentvine sync
      { job: "activity_deep", last_run_at: at("2026-11-08T09:00:00Z"), detail: null },
      { job: "rentvine_core", last_run_at: at("2026-11-10T10:20:00Z"), detail: null },
      { job: "open_loops_digest", last_run_at: null, detail: null },
    ]);
    const body = await (await GET()).json();
    expect(body.updatedAt).toBe("2026-11-10T13:10:00.000Z");
    expect(body.stuck).toBe(false);
  });

  it("still flags a stuck communications backlog", async () => {
    rows.mockResolvedValue([
      { job: "tasks", last_run_at: at("2026-11-10T14:05:00Z"), detail: null },
      { job: "activity_refresh", last_run_at: at("2026-11-10T13:10:00Z"), detail: '{"stuck_since":"x"}' },
    ]);
    const body = await (await GET()).json();
    expect(body.stuck).toBe(true);
  });

  it("returns {} when no communications sync has run", async () => {
    rows.mockResolvedValue([{ job: "rentvine_core", last_run_at: at("2026-11-10T10:20:00Z"), detail: null }]);
    expect(await (await GET()).json()).toEqual({});
  });
});
