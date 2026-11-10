import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_SOURCES } from "@/config/data-sources";

// Vercel Cron drives the sync schedule (GitHub's own cron drops runs). Each
// entry must hit /api/cron/sync with a tier that actually has sources, or the
// schedule silently does nothing.
type Cron = { path: string; schedule: string };
const vercel = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")) as { crons?: Cron[] };
const allCrons = vercel.crons ?? [];
// The sync-dispatch crons (the text-alerts cron is checked separately below).
const crons = allCrons.filter((c) => c.path.startsWith("/api/cron/sync"));

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
    expect(new Set(allCrons.map((c) => c.path)).size).toBe(allCrons.length);
  });

  it("uses valid 5-field schedules", () => {
    for (const c of allCrons) expect(c.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it("checks for outbound-text alerts every 5 minutes", () => {
    expect(allCrons).toContainEqual({ path: "/api/cron/text-alerts", schedule: "*/5 * * * *" });
    expect(allCrons.every((c) => /^\/api\/cron\/(sync\?|text-alerts$)/.test(c.path))).toBe(true);
  });

  // GitHub Actions minutes: each run of the leadsimple-search sync + backfill
  // (private repo, billed) costs ~12 min, so the "hourly" tier runs every 2h by
  // day and once overnight — 8 runs/day — to stay near the free allowance.
  const hoursOf = (field: string): number[] => {
    const out: number[] = [];
    for (const part of field.split(",")) {
      const [range, step] = part.split("/");
      const [a, b] = range === "*" ? [0, 23] : range.split("-").map(Number);
      for (let h = a; h <= (b ?? a); h += Number(step ?? 1)) out.push(h);
    }
    return out;
  };
  const hourlyHours = () =>
    crons.filter((c) => tierOf(c) === "hourly").flatMap((c) => hoursOf(c.schedule.split(/\s+/)[1]));

  it("runs the sync tier every 2 hours by day (7am–7pm ET is 11–23 UTC)", () => {
    const hours = hourlyHours();
    expect(hours).toEqual(expect.arrayContaining([11, 13, 15, 17, 19, 21, 23]));
    expect(hours).not.toContain(12);
  });

  it("runs the sync tier at most 8 times a day (Actions minutes budget)", () => {
    expect(new Set(hourlyHours()).size).toBeLessThanOrEqual(8);
  });
});
