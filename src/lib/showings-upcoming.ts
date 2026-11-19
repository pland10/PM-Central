import { todayInET } from "@/lib/calendar/today";

// Is a showing still ahead — what the Showings page counts as "upcoming" and
// lists by default? Compared by calendar day in Eastern time, so one set for
// earlier today still counts. A requested showing with no time yet counts too
// (it needs scheduling), until every time the lead asked for has passed.
// Pure; shared by the page (server) and the table (client).
export function isUpcomingShowing(
  r: { status: string; startTime: string | null; requestedTime: string | null },
  now: Date = new Date()
): boolean {
  if (["cancelled", "no-show", "completed"].includes(r.status)) return false;
  const today = todayInET(now);
  const todayOrLater = (iso: string) => todayInET(new Date(iso)) >= today;
  if (r.startTime) return todayOrLater(r.startTime);
  return r.requestedTime == null || todayOrLater(r.requestedTime);
}
