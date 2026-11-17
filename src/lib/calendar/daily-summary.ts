import { isBusinessDay } from "@/lib/calendar/business-days";
import { hourInET, todayInET } from "@/lib/calendar/today";
import type { AttentionWorkOrder, ReturnedPayment, StaleSync } from "@/lib/push-alerts";

// The daily summary email: today's calendar tasks, overdue ones still open, and
// the day's alerts. Pure — gathering is ./daily-summary-live.ts, sending is the
// /api/cron/daily-summary route (6am ET, business days) and "Send now".

export const SUMMARY_HOUR_ET = 6;

export type DailySummaryData = {
  date: string; // YYYY-MM-DD (Eastern)
  dueToday: { title: string; rule: string; owner: string | null; done: boolean }[];
  overdue: { title: string; rule: string; owner: string | null; date: string }[];
  workOrders: AttentionWorkOrder[]; // new / urgent
  returnedPayments: ReturnedPayment[];
  draws: { count: number; total: number } | null; // null = couldn't check Rentvine
  syncProblems: StaleSync[];
};

// Is it the 6am Eastern hour of a business day? (The cron runs at 10:00 and
// 11:00 UTC so one of them is 6am ET in both EST and EDT.)
export function isSummaryTime(now: Date): boolean {
  return hourInET(now) === SUMMARY_HOUR_ET && isBusinessDay(todayInET(now));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const day = (d: string, withWeekday = false) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

export function buildDailySummary(d: DailySummaryData, appUrl: string): { subject: string; html: string } {
  const open = d.dueToday.filter((t) => !t.done).length;
  const alerts = d.workOrders.length + d.returnedPayments.length + d.syncProblems.length + (d.draws && d.draws.count > 0 ? 1 : 0);
  const counts = [
    open ? `${plural(open, "task")} due` : "",
    d.overdue.length ? `${d.overdue.length} overdue` : "",
    alerts ? plural(alerts, "alert") : "",
  ].filter(Boolean);
  const subject = `PM Central daily summary · ${day(d.date, true)} · ${counts.length ? counts.join(", ") : "nothing due"}`;

  const h2 = (t: string) => `<h2 style="font-size:15px;margin:20px 0 6px;color:#0f172a">${esc(t)}</h2>`;
  const li = (s: string) => `<li style="margin:3px 0">${s}</li>`;
  const ul = (items: string[]) => `<ul style="margin:0;padding-left:18px">${items.join("")}</ul>`;
  const muted = (s: string) => `<span style="color:#64748b">${s}</span>`;
  const none = (s: string) => `<p style="margin:0;color:#64748b">${esc(s)}</p>`;
  const link = (path: string, label: string) => `<a href="${esc(appUrl)}${path}" style="color:#ea580c">${esc(label)}</a>`;
  const owner = (o: string | null) => muted(` · ${esc(o ?? "Unassigned")}`);

  const parts: string[] = [];
  parts.push(h2(`Due today (${day(d.date, true)})`));
  parts.push(
    d.dueToday.length
      ? ul(d.dueToday.map((t) => li(`${t.done ? "✅ " : ""}<strong>${esc(t.title)}</strong> ${muted(`(${esc(t.rule)})`)}${owner(t.owner)}${t.done ? muted(" · Done") : ""}`)))
      : none("Nothing due today.")
  );
  if (d.overdue.length) {
    parts.push(h2("Overdue — still open"));
    parts.push(ul(d.overdue.map((t) => li(`<strong>${esc(t.title)}</strong> ${muted(`(${esc(t.rule)}) · was due ${day(t.date)}`)}${owner(t.owner)}`))));
  }
  parts.push(`<p style="margin:8px 0 0">${link("/calendar", "Open the calendar")}</p>`);

  parts.push(h2("Alerts"));
  const alertBlocks: string[] = [];
  if (d.workOrders.length) {
    alertBlocks.push(
      `<p style="margin:8px 0 2px"><strong>New / urgent work orders</strong></p>` +
        ul(d.workOrders.map((w) => li(`#${esc(w.number)} — ${esc(w.issue)}${w.property ? muted(` · ${esc(w.property)}`) : ""}${w.isHigh ? ` <strong style="color:#b91c1c">High</strong>` : ""}`)))
    );
  }
  if (d.returnedPayments.length) {
    alertBlocks.push(
      `<p style="margin:8px 0 2px"><strong>Returned / NSF payments</strong></p>` +
        ul(d.returnedPayments.map((p) => li(`${money(p.amount)}${p.tenant ? ` from ${esc(p.tenant)}` : ""}${p.property ? muted(` · ${esc(p.property)}`) : ""}`)))
    );
  }
  if (d.draws && d.draws.count > 0) {
    alertBlocks.push(
      `<p style="margin:8px 0 2px"><strong>Draws ready to batch</strong></p>` +
        `<p style="margin:0">${plural(d.draws.count, "payment")} to PMI Lighthouse · ${money(d.draws.total)} · ${link("/accounting/rentvine", "Rentvine Transactions")}</p>`
    );
  }
  if (d.syncProblems.length) {
    alertBlocks.push(
      `<p style="margin:8px 0 2px"><strong>Sync problems</strong></p>` +
        ul(d.syncProblems.map((s) => li(`${esc(s.label)} ${muted(`hasn't updated${s.lastRun ? ` since ${day(s.lastRun.slice(0, 10))}` : ""} (expected ${esc(s.cadence.toLowerCase())})`)}`)))
    );
  }
  parts.push(alertBlocks.length ? alertBlocks.join("") : none("No alerts."));

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#334155;max-width:640px">
<h1 style="font-size:18px;margin:0 0 4px;color:#0f172a">PM Central — ${esc(day(d.date, true))}</h1>
${parts.join("\n")}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Sent by PM Central at 6am ET on business days. Change who gets it on the ${link("/calendar", "Calendar")} page.</p>
</div>`;
  return { subject, html };
}

const MAX_RECIPIENTS = 10;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// The summary's recipients from a typed list ("a@x.com, b@y.com") or an array:
// lower-cased, de-duplicated, at most 10.
export function parseRecipients(input: unknown): { ok: true; emails: string[] } | { ok: false; error: string } {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[\s,;]+/);
  const emails = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { ok: false, error: `"${bad}" isn't an email address.` };
  if (emails.length > MAX_RECIPIENTS) return { ok: false, error: `At most ${MAX_RECIPIENTS} addresses.` };
  return { ok: true, emails };
}
