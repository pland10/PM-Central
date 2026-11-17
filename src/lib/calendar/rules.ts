import {
  addBusinessDays,
  addDays,
  daysInMonth,
  isBusinessDay,
  nextBusinessDay,
  priorBusinessDay,
  weekday,
  ymd,
  type YMD,
} from "@/lib/calendar/business-days";

// Date rules for the close calendar. A rule says where in a month an event
// falls; the event's frequency says which months it runs in. Pure — shared by
// the page (client) and the alerts cron (server).
//
//   ME            last day of the month          ME-5    5 calendar days before it
//   ME-5BD        5 business days before it       ME+3    3 calendar days after it
//   MS            the 1st                         MS+3 / MS+3BD   3 (business) days after
//   D10           the 10th (capped at month end)
//   BD3           3rd business day                BD-1    last business day
//
// A "daily" event has no rule (stored as DAILY): it falls on every business day.
// A "weekly" event's rule lists its weekdays, e.g. WEEKLY:MO,WE,FR; a chosen day
// that's a bank holiday is skipped that week.
//
// Calendar-day results that land on a weekend / bank holiday move per the
// event's `adjust` (prior business day by default). Business-day results are
// business days already.

export type Rule =
  | { kind: "anchor"; anchor: "MS" | "ME"; offset: number; business: boolean }
  | { kind: "day"; day: number }
  | { kind: "bd"; n: number };

export type Adjust = "prior" | "next" | "none";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

// The stored rule for an every-business-day event (it needs no date rule).
export const DAILY_RULE = "DAILY";

// Weekly events: weekdays as 1 = Mon … 5 = Fri (Date#getUTCDay numbering).
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR"];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// "WEEKLY:MO,WE,FR" → [1, 3, 5] (sorted, unique); null if it isn't a valid list.
export function parseWeekdays(rule: string): number[] | null {
  const m = /^WEEKLY:(.*)$/.exec((rule ?? "").replace(/\s+/g, "").toUpperCase());
  if (!m || !m[1]) return null;
  const days = m[1].split(",").map((c) => WEEKDAY_CODES.indexOf(c) + 1);
  if (days.some((d) => d < 1)) return null;
  return [...new Set(days)].sort((a, b) => a - b);
}
export const formatWeekdays = (days: number[]) =>
  `WEEKLY:${[...new Set(days)].sort((a, b) => a - b).map((d) => WEEKDAY_CODES[d - 1]).join(",")}`;
export const describeWeekdays = (days: number[]) => days.map((d) => WEEKDAY_NAMES[d - 1]).join(", ");

export const RULE_HELP = "Use ME-5, ME-5BD, MS+3, D10, BD3 or BD-1.";

const MAX_OFFSET = 31;
const MAX_BD = 23;

export function parseRule(input: string): { ok: true; rule: Rule } | { ok: false; error: string } {
  const s = (input ?? "").replace(/\s+/g, "").toUpperCase();
  const bad = (why: string) => ({ ok: false as const, error: `${why} ${RULE_HELP}` });
  if (!s) return bad("Enter a date rule.");

  let m = /^(MS|ME)(?:([+-])(\d{1,2})(BD)?)?$/.exec(s);
  if (m) {
    const offset = m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3]) : 0;
    if (Math.abs(offset) > MAX_OFFSET) return bad(`An offset can be at most ${MAX_OFFSET} days.`);
    return { ok: true, rule: { kind: "anchor", anchor: m[1] as "MS" | "ME", offset, business: !!m[4] } };
  }
  m = /^D(\d{1,2})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return bad("The day must be 1–31.");
    return { ok: true, rule: { kind: "day", day } };
  }
  m = /^BD(-?\d{1,2})$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n === 0 || Math.abs(n) > MAX_BD) return bad(`Business day must be 1–${MAX_BD} (or -1 to -${MAX_BD} from the end).`);
    return { ok: true, rule: { kind: "bd", n } };
  }
  return bad(`"${input.trim()}" isn't a date rule I know.`);
}

// The canonical spelling, e.g. "ME-5BD".
export function formatRule(r: Rule): string {
  if (r.kind === "day") return `D${r.day}`;
  if (r.kind === "bd") return `BD${r.n}`;
  if (r.offset === 0) return r.anchor;
  return `${r.anchor}${r.offset > 0 ? "+" : "-"}${Math.abs(r.offset)}${r.business ? "BD" : ""}`;
}

const ordinal = (n: number) => {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeRule(r: Rule): string {
  if (r.kind === "day") return `${ordinal(r.day)} of the month`;
  if (r.kind === "bd") {
    if (r.n === -1) return "Last business day of the month";
    if (r.n < 0) return `${ordinal(-r.n)}-to-last business day of the month`;
    return `${ordinal(r.n)} business day of the month`;
  }
  const where = r.anchor === "ME" ? "month end" : "the 1st";
  if (r.offset === 0) return r.anchor === "ME" ? "Last day of the month" : "1st of the month";
  const unit = r.business ? "business day" : "calendar day";
  return `${plural(Math.abs(r.offset), unit)} ${r.offset < 0 ? "before" : "after"} ${where}`;
}

function adjustTo(d: YMD, adjust: Adjust): YMD {
  if (adjust === "none" || isBusinessDay(d)) return d;
  return adjust === "next" ? nextBusinessDay(d) : priorBusinessDay(d);
}

// The date a rule lands on for a given month (1–12).
export function dateFor(r: Rule, year: number, month: number, adjust: Adjust = "prior"): YMD {
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));
  if (r.kind === "day") return adjustTo(ymd(year, month, Math.min(r.day, daysInMonth(year, month))), adjust);
  if (r.kind === "bd") {
    return r.n > 0 ? addBusinessDays(nextBusinessDay(first), r.n - 1) : addBusinessDays(priorBusinessDay(last), r.n + 1);
  }
  const base = r.anchor === "ME" ? last : first;
  if (r.business && r.offset !== 0) return addBusinessDays(base, r.offset);
  return adjustTo(addDays(base, r.offset), adjust);
}

// Does an event with this frequency run in month m (1–12)? `month` is the
// month of the year (yearly) or of the quarter, 1–3 (quarterly).
export function occursInMonth(frequency: Frequency, month: number | null, m: number): boolean {
  if (frequency === "daily" || frequency === "weekly") return true;
  if (frequency === "yearly") return m === month;
  if (frequency === "quarterly") return ((m - 1) % 3) + 1 === month;
  return true;
}

export type CalendarEventRule = { id: number; rule: string; frequency: Frequency; month: number | null; adjust: Adjust };
// One dated occurrence. `period` is the key it's checked off under: the month
// ("YYYY-MM") it belongs to — even when the date spills into another month — or,
// for a daily event, the day itself ("YYYY-MM-DD").
export type Occurrence = { eventId: number; period: string; date: YMD };

// Every occurrence dated within [from, to] (inclusive), sorted by date.
export function occurrencesBetween(events: CalendarEventRule[], from: YMD, to: YMD): Occurrence[] {
  const out: Occurrence[] = [];
  // Per-day events (every business day, or chosen weekdays): one occurrence per
  // matching business day, checked off under the day itself.
  const perDay = events
    .filter((e) => e.frequency === "daily" || e.frequency === "weekly")
    .map((e) => ({ id: e.id, days: e.frequency === "weekly" ? parseWeekdays(e.rule) : null, weekly: e.frequency === "weekly" }))
    .filter((e) => !e.weekly || e.days !== null);
  if (perDay.length) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isBusinessDay(d)) continue;
      const wd = weekday(d);
      for (const e of perDay) if (!e.days || e.days.includes(wd)) out.push({ eventId: e.id, period: d, date: d });
    }
  }
  events = events.filter((e) => e.frequency !== "daily" && e.frequency !== "weekly");
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  // One month either side: an ME+3 / MS-5 rule can spill across a month boundary.
  let y = fm === 1 ? fy - 1 : fy;
  let m = fm === 1 ? 12 : fm - 1;
  const endKey = (tm === 12 ? ty + 1 : ty) * 12 + (tm === 12 ? 1 : tm + 1);
  for (; y * 12 + m <= endKey; m === 12 ? ((m = 1), y++) : m++) {
    for (const e of events) {
      if (!occursInMonth(e.frequency, e.month, m)) continue;
      const parsed = parseRule(e.rule);
      if (!parsed.ok) continue;
      const date = dateFor(parsed.rule, y, m, e.adjust);
      if (date >= from && date <= to) out.push({ eventId: e.id, period: `${y}-${String(m).padStart(2, "0")}`, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.eventId - b.eventId);
}
