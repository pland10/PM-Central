import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_SOURCES } from "@/config/data-sources";

// Vercel Cron drives the sync schedule (GitHub's own cron drops runs). Each
// entry must hit /api/cron/sync with a tier that actually has sources, or the
// schedule silently does nothing.
type Cron = { path: string; schedule: string };
const vercel = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")) as { crons?: Cron[] };
const crons = vercel.crons ?? [];

const tierOf = (c: Cron) => new URL(c.path, "https://x").searchParams.get("tier");

describe("vercel.json crons", () => {
  it("schedules both the hourly and the daily sync tiers", () => {
    const tiers = new Set(crons.map(tierOf));
    expect(tiers).toEqual(new Set(["hourly", "daily"]));
  });

  it("only calls the cron sync endpoint, with tiers that have sources", () => {
    for (const c of crons) {
      expect(c.path.startsWith("/api/cron/sync?")).toBe(true);
      const tier = tierOf(c);
      expect(DATA_SOURCES.some((s) => s.tier === tier)).toBe(true);
    }
  });

  it("gives every cron a distinct path", () => {
    expect(new Set(crons.map((c) => c.path)).size).toBe(crons.length);
  });

  it("uses valid 5-field schedules", () => {
    for (const c of crons) expect(c.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it("runs the hourly tier every daytime hour (7am–7pm ET is 11–23 UTC)", () => {
    const hourly = crons.filter((c) => tierOf(c) === "hourly").map((c) => c.schedule);
    expect(hourly.some((s) => s.split(/\s+/)[1] === "11-23")).toBe(true);
  });
});
