// "Today" for the close calendar is the business's day — Eastern time — so a
// task due on the 25th isn't due at 7pm on the 24th (UTC midnight).
const TZ = "America/New_York";

export function todayInET(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hourInET(now = new Date()): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return h === 24 ? 0 : h;
}

// "YYYY-MM" for the months `before` back to `after` ahead of a date's month.
export function monthsAround(date: string, before: number, after: number): string[] {
  const [y, m] = date.split("-").map(Number);
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const idx = y * 12 + (m - 1) + i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}
