import { requireFeature } from "@/config/features";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getDigestRecipients, listCalendarEvents, listTaskStatuses } from "@/lib/calendar/db";
import { monthsAround, todayInET } from "@/lib/calendar/today";
import { listStaff } from "@/lib/staff";
import { assignMissingColors } from "@/lib/calendar/colors-db";
import { CloseCalendar } from "./CloseCalendar";

export const dynamic = "force-dynamic";

// How far either side of this month the page can move (and loads check-offs for).
const WINDOW_MONTHS = 12;

// Close calendar: recurring month-end / financial deadlines (rules like ME-5),
// each a task with an owner that's checked off every month. Admins edit events.
export default async function CalendarPage() {
  requireFeature("calendar");
  const today = todayInET();
  const user = await getCurrentUser();
  try {
    const isAdmin = user?.role === "admin";
    const [events, statuses, staff, digestTo] = await Promise.all([
      listCalendarEvents(prisma),
      listTaskStatuses(prisma, monthsAround(today, WINDOW_MONTHS + 1, WINDOW_MONTHS + 1)),
      listStaff().catch(() => []),
      isAdmin ? getDigestRecipients(prisma).catch(() => []) : Promise.resolve([] as string[]),
    ]);
    // Everyone gets a color: people who own tasks first, then everyone else
    // alphabetically, until the colors run out. They can change it with My color.
    const owners = events.map((e) => e.ownerEmail).filter((e): e is string => !!e);
    const colors = await assignMissingColors(prisma, [...owners, ...staff.map((s) => s.email)]).catch(
      () => ({}) as Record<string, string>
    );
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="mb-6 text-sm text-slate-500">Month-end and financial deadlines. Each one is a task to check off every time it comes around.</p>
        <CloseCalendar
          initialEvents={events}
          initialStatuses={statuses}
          staff={staff}
          today={today}
          canEdit={isAdmin}
          windowMonths={WINDOW_MONTHS}
          digestTo={digestTo}
          colors={colors}
          me={user?.email ?? ""}
        />
      </div>
    );
  } catch (e) {
    console.error("[calendar] load failed:", e);
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Couldn&apos;t load the calendar. Try again in a moment.</p>
      </div>
    );
  }
}
