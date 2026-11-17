import { prisma } from "@/lib/prisma";
import { addDays, priorBusinessDay } from "@/lib/calendar/business-days";
import { listCalendarEvents, listTaskStatuses } from "@/lib/calendar/db";
import type { CalendarEvent } from "@/lib/calendar/events";
import { occurrencesBetween, ruleLabel } from "@/lib/calendar/rules";
import { monthsAround, todayInET } from "@/lib/calendar/today";
import type { DailySummaryData } from "@/lib/calendar/daily-summary";
import { livePushAlertDeps } from "@/lib/push-alerts-live";

// Gathers the daily summary (src/lib/calendar/daily-summary.ts) from the
// calendar and the same live sources the push alerts use. Each source is
// best-effort: one failing leaves its section empty instead of stopping the email.

const OVERDUE_LOOKBACK_DAYS = 45;
const perDay = (e: CalendarEvent) => e.frequency === "daily" || e.frequency === "weekly";

async function calendarFor(date: string): Promise<Pick<DailySummaryData, "dueToday" | "overdue">> {
  const events = (await listCalendarEvents(prisma)).filter((e) => e.active);
  const byId = new Map(events.map((e) => [e.id, e]));
  const from = addDays(date, -OVERDUE_LOOKBACK_DAYS);
  const months = monthsAround(date, Math.ceil(OVERDUE_LOOKBACK_DAYS / 31), 0).filter((m) => m >= from.slice(0, 7));
  const done = await listTaskStatuses(prisma, months);
  const isDone = (o: { eventId: number; period: string }) => !!done[`${o.eventId}:${o.period}`];
  const prevBusinessDay = priorBusinessDay(addDays(date, -1));

  const dueToday = occurrencesBetween(events, date, date).map((o) => {
    const e = byId.get(o.eventId)!;
    return { title: e.title, rule: ruleLabel(e.frequency, e.rule), owner: e.ownerName, done: isDone(o) };
  });
  // Still open from before today. Per-day tasks (daily / chosen weekdays) only
  // count the previous business day — otherwise a missed week would flood it.
  const overdue = occurrencesBetween(events, from, addDays(date, -1))
    .filter((o) => !isDone(o) && (!perDay(byId.get(o.eventId)!) || o.date === prevBusinessDay))
    .map((o) => {
      const e = byId.get(o.eventId)!;
      return { title: e.title, rule: ruleLabel(e.frequency, e.rule), owner: e.ownerName, date: o.date };
    });
  return { dueToday, overdue };
}

export async function gatherDailySummary(now = new Date()): Promise<DailySummaryData> {
  const date = todayInET(now);
  const deps = livePushAlertDeps();
  const [cal, workOrders, returnedPayments, draws, syncProblems] = await Promise.all([
    calendarFor(date).catch(() => ({ dueToday: [], overdue: [] })),
    deps.attentionWorkOrders().catch(() => []),
    deps.returnedPayments().catch(() => []),
    deps.readyDraws().catch(() => null),
    deps.staleSyncs().catch(() => []),
  ]);
  return {
    date,
    ...cal,
    workOrders,
    returnedPayments,
    draws: draws ? { count: draws.length, total: Math.round(draws.reduce((s, d) => s + d.amount, 0) * 100) / 100 } : null,
    syncProblems,
  };
}
