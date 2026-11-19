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

// Shift a YYYY-MM-DD date by whole days.
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// Date-picker options for a weekly sheet: next week's date first (so you can
// prep ahead), then this week and the recent past, newest first.
export function meetingDateOptions(now: Date, isoDow: number, back = 8): string[] {
  const past = recentMeetingDates(now, isoDow, back);
  return [addDays(past[0], 7), ...past];
}

// Status a strategic-meeting topic can be in. Stored as a slug on the topic.
export const TOPIC_STATUSES = ["open", "in_progress", "done"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};
export function isTopicStatus(s: unknown): s is TopicStatus {
  return typeof s === "string" && (TOPIC_STATUSES as readonly string[]).includes(s);
}

// Nest topics under their sections, preserving the order each list comes in.
export function nestTopics<S extends { id: number }, T extends { sectionId: number }>(
  sections: S[],
  topics: T[]
): (S & { topics: T[] })[] {
  return sections.map((s) => ({ ...s, topics: topics.filter((t) => t.sectionId === s.id) }));
}

// Split houses into the two meeting sections — Rental Units first, Squatter
// Watch last. Squatter Watch comes from the Rentvine "Squatterwatch Properties"
// group (a tag on the property), see programs.ts. Within each group, houses
// follow the admin's custom sequence (`order`: property id → position); houses
// with no saved position fall to the end, alphabetically.
export function splitMeetingGroups<T extends { id: string; tags: string | null; sortKey: string }>(
  items: T[],
  order: Record<string, number> = {}
): { rentals: T[]; squatterWatch: T[] } {
  const rank = (t: T) => (t.id in order ? order[t.id] : Number.MAX_SAFE_INTEGER);
  const cmp = (a: T, b: T) => rank(a) - rank(b) || a.sortKey.toLowerCase().localeCompare(b.sortKey.toLowerCase());
  const rentals: T[] = [];
  const squatterWatch: T[] = [];
  for (const it of items) (isSquatterWatch(it.tags) ? squatterWatch : rentals).push(it);
  rentals.sort(cmp);
  squatterWatch.sort(cmp);
  return { rentals, squatterWatch };
}
