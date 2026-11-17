// Business-day math for the close calendar (src/lib/calendar/rules.ts). Dates
// are plain "YYYY-MM-DD" strings handled in UTC, so there's no time-zone drift.
//
// A business day is Mon–Fri that isn't a Federal Reserve bank holiday — the days
// banks process deposits, checks and transfers. Fed rule for fixed-date
// holidays: one that falls on a Sunday is observed Monday; one that falls on a
// Saturday is not moved (banks are open the Friday before).

export type YMD = string;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number): YMD => `${y}-${pad(m)}-${pad(d)}`;

function toDate(s: YMD): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromDate(d: Date): YMD {
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const weekday = (s: YMD) => toDate(s).getUTCDay(); // 0 = Sunday

export function addDays(s: YMD, n: number): YMD {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

// The nth (1-based) given weekday of a month, or the last one when n = -1.
function nthWeekday(y: number, m: number, wd: number, n: number): YMD {
  if (n === -1) {
    const last = daysInMonth(y, m);
    const lastWd = weekday(ymd(y, m, last));
    return ymd(y, m, last - ((lastWd - wd + 7) % 7));
  }
  const firstWd = weekday(ymd(y, m, 1));
  return ymd(y, m, 1 + ((wd - firstWd + 7) % 7) + (n - 1) * 7);
}

function observedFixed(y: number, m: number, d: number): YMD | null {
  const s = ymd(y, m, d);
  const wd = weekday(s);
  if (wd === 0) return addDays(s, 1); // Sunday → Monday
  if (wd === 6) return null; // Saturday → not observed by the Fed
  return s;
}

const holidayCache = new Map<number, Set<YMD>>();

// Federal Reserve bank holidays for a year, as observed.
export function bankHolidays(y: number): Set<YMD> {
  const hit = holidayCache.get(y);
  if (hit) return hit;
  const days = [
    observedFixed(y, 1, 1), // New Year's Day
    nthWeekday(y, 1, 1, 3), // Martin Luther King Jr. Day — 3rd Monday of January
    nthWeekday(y, 2, 1, 3), // Washington's Birthday — 3rd Monday of February
    nthWeekday(y, 5, 1, -1), // Memorial Day — last Monday of May
    observedFixed(y, 6, 19), // Juneteenth
    observedFixed(y, 7, 4), // Independence Day
    nthWeekday(y, 9, 1, 1), // Labor Day — 1st Monday of September
    nthWeekday(y, 10, 1, 2), // Columbus Day — 2nd Monday of October
    observedFixed(y, 11, 11), // Veterans Day
    nthWeekday(y, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    observedFixed(y, 12, 25), // Christmas Day
  ].filter((d): d is YMD => d !== null);
  const set = new Set(days);
  holidayCache.set(y, set);
  return set;
}

export function isBusinessDay(s: YMD): boolean {
  const wd = weekday(s);
  if (wd === 0 || wd === 6) return false;
  return !bankHolidays(Number(s.slice(0, 4))).has(s);
}

// The day itself if it's a business day, else the closest one before / after.
export function priorBusinessDay(s: YMD): YMD {
  let d = s;
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}
export function nextBusinessDay(s: YMD): YMD {
  let d = s;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

// Move n business days forward (n > 0) or back (n < 0), not counting the start
// day itself. n = 0 returns the start day unchanged.
export function addBusinessDays(s: YMD, n: number): YMD {
  let d = s;
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    if (isBusinessDay(d)) left--;
  }
  return d;
}
