import { isSquatterWatch } from "@/lib/programs";

// Monday tactical meeting: we walk every house and take dated notes. Dates are
// plain calendar dates (YYYY-MM-DD) anchored to the meeting's Monday. Pure
// helpers here so the date math and grouping are testable; the DB + page wire
// them up (src/lib/meetings-db.ts, src/app/(app)/meetings).

// A date as YYYY-MM-DD (UTC calendar date).
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// True for a well-formed YYYY-MM-DD string (used to validate request input).
export function isMeetingDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// The most recent given weekday (ISO: 1=Mon … 7=Sun) on or before `now`.
// Monday drives the tactical meeting; Tuesday the strategic one.
export function weekMeetingDate(now: Date, isoDow: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Mon … 7=Sun
  d.setUTCDate(d.getUTCDate() - ((dow - isoDow + 7) % 7));
  return isoDate(d);
}

// The most recent `count` meeting dates for a weekday, newest first (date picker).
export function recentMeetingDates(now: Date, isoDow: number, count = 8): string[] {
  const first = new Date(`${weekMeetingDate(now, isoDow)}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() - i * 7);
    return isoDate(d);
  });
}

export const mondayOf = (now: Date) => weekMeetingDate(now, 1);
export const tuesdayOf = (now: Date) => weekMeetingDate(now, 2);
export const recentMeetingMondays = (now: Date, count = 8) => recentMeetingDates(now, 1, count);
export const recentMeetingTuesdays = (now: Date, count = 8) => recentMeetingDates(now, 2, count);

// Nest topics under their sections, preserving the order each list comes in.
export function nestTopics<S extends { id: number }, T extends { sectionId: number }>(
  sections: S[],
  topics: T[]
): (S & { topics: T[] })[] {
  return sections.map((s) => ({ ...s, topics: topics.filter((t) => t.sectionId === s.id) }));
}

// Split houses into the two meeting sections — Rental Units first, Squatter
// Watch last — each sorted by its label. Squatter Watch comes from the Rentvine
// "Squatterwatch Properties" group (a tag on the property), see programs.ts.
export function splitMeetingGroups<T extends { tags: string | null; sortKey: string }>(
  items: T[]
): { rentals: T[]; squatterWatch: T[] } {
  const byLabel = (a: T, b: T) => a.sortKey.toLowerCase().localeCompare(b.sortKey.toLowerCase());
  const rentals: T[] = [];
  const squatterWatch: T[] = [];
  for (const it of items) (isSquatterWatch(it.tags) ? squatterWatch : rentals).push(it);
  rentals.sort(byLabel);
  squatterWatch.sort(byLabel);
  return { rentals, squatterWatch };
}
