"use client";

import { useId, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { CALENDAR_COLORS, NO_COLOR, colorName } from "@/lib/calendar/colors";
import { addDays, daysInMonth, weekday, ymd } from "@/lib/calendar/business-days";
import type { CalendarEvent, TaskStatus } from "@/lib/calendar/events";
import {
  DAILY_RULE,
  describeRule,
  describeWeekdays,
  formatWeekdays,
  occurrencesBetween,
  parseRule,
  parseWeekdays,
  type Adjust,
  type Frequency,
  type Occurrence,
} from "@/lib/calendar/rules";
import type { StaffMember } from "@/lib/work-order-notes";

// The close calendar: a month grid of deadlines plus the month's task list to
// check off. Admins add / edit / delete events (rules like ME-5 — see
// src/lib/calendar/rules.ts). Dates are computed here from the rules, so moving
// between months needs no server round trip.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUARTER_MONTHS = ["1st month (Jan, Apr, Jul, Oct)", "2nd month (Feb, May, Aug, Nov)", "3rd month (Mar, Jun, Sep, Dec)"];

const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};
const fmtDoneAt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const keyOf = (o: Occurrence) => `${o.eventId}:${o.period}`;
// Every business day, or weekly on chosen days: one task per day.
const isPerDay = (e: Pick<CalendarEvent, "frequency">) => e.frequency === "daily" || e.frequency === "weekly";
const weekdaysOf = (rule: string) => describeWeekdays(parseWeekdays(rule) ?? []);
const ruleBadge = (e: Pick<CalendarEvent, "frequency" | "rule">) =>
  e.frequency === "daily" ? "Daily" : e.frequency === "weekly" ? weekdaysOf(e.rule) : e.rule;
const repeatsText = (e: Pick<CalendarEvent, "frequency" | "month" | "rule">) =>
  e.frequency === "daily"
    ? "Every business day"
    : e.frequency === "weekly"
    ? `Weekly · ${weekdaysOf(e.rule)}`
    : e.frequency === "yearly"
    ? `Yearly · ${MONTHS[(e.month ?? 1) - 1]}`
    : e.frequency === "quarterly"
      ? `Quarterly · ${QUARTER_MONTHS[(e.month ?? 1) - 1].split(" (")[0]}`
      : "Monthly";

export function CloseCalendar({
  initialEvents,
  initialStatuses,
  staff,
  today,
  canEdit,
  windowMonths = 12,
  digestTo = [],
  colors: initialColors = {},
  me = "",
}: {
  initialEvents: CalendarEvent[];
  initialStatuses: Record<string, TaskStatus>;
  staff: StaffMember[];
  today: string; // YYYY-MM-DD, Eastern time (from the server, so it doesn't shift on hydrate)
  canEdit: boolean;
  windowMonths?: number;
  digestTo?: string[]; // daily summary recipients (admins only)
  colors?: Record<string, string>; // person (lower-case email) → their calendar color
  me?: string; // the signed-in person's email (picks their own color)
}) {
  const [events, setEvents] = useState(initialEvents);
  const [colors, setColors] = useState(initialColors);
  const colorOf = (email: string | null | undefined) => (email ? colors[email.toLowerCase()] : undefined) ?? NO_COLOR;
  const [statuses, setStatuses] = useState(initialStatuses);
  const [ty, tm] = today.split("-").map(Number);
  const [view, setView] = useState({ y: ty, m: tm });
  const [editing, setEditing] = useState<CalendarEvent | "new" | null>(null);
  const [error, setError] = useState("");

  const idx = (v: { y: number; m: number }) => v.y * 12 + v.m - 1;
  const step = (n: number) =>
    setView((v) => {
      const i = idx(v) + n;
      return { y: Math.floor(i / 12), m: (i % 12) + 1 };
    });
  const canPrev = idx(view) > idx({ y: ty, m: tm }) - windowMonths;
  const canNext = idx(view) < idx({ y: ty, m: tm }) + windowMonths;

  const first = ymd(view.y, view.m, 1);
  const last = ymd(view.y, view.m, daysInMonth(view.y, view.m));
  const active = useMemo(() => events.filter((e) => e.active), [events]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const occ = useMemo(() => occurrencesBetween(active, first, last), [active, first, last]);
  // The task list shows per-day tasks (every business day / chosen weekdays) only
  // for today (the grid shows every day); otherwise they'd fill the list.
  const listed = useMemo(
    () => occ.filter((o) => o.date === today || !isPerDay(byId.get(o.eventId) ?? { frequency: "monthly" })),
    [occ, byId, today]
  );

  async function toggle(o: Occurrence) {
    setError("");
    const key = keyOf(o);
    const before = statuses[key];
    const done = !before;
    setStatuses((s) => {
      const next = { ...s };
      if (done) next[key] = { doneBy: "", doneByName: "you", doneAt: new Date().toISOString() };
      else delete next[key];
      return next;
    });
    try {
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: o.eventId, period: o.period, done }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Couldn't save.");
      if (done && d.status) setStatuses((s) => ({ ...s, [key]: d.status as TaskStatus }));
    } catch (e) {
      setStatuses((s) => {
        const next = { ...s };
        if (before) next[key] = before;
        else delete next[key];
        return next;
      });
      setError(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  // Month grid cells: blanks before the 1st, then each day.
  const lead = weekday(first);
  const dim = daysInMonth(view.y, view.m);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => ymd(view.y, view.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  // Grid chips are the owner's color; done = faded + struck through; overdue = red outline.
  const chipStatus = (o: Occurrence) =>
    statuses[keyOf(o)] ? "line-through opacity-50" : o.date < today ? "ring-1 ring-inset ring-red-500" : "";
  const chipStyle = (hex: string) => ({
    borderLeftWidth: 3,
    borderLeftStyle: "solid" as const,
    borderLeftColor: hex,
    backgroundColor: `${hex}1A`,
    color: hex,
  });
  // Legend: everyone who has picked a color, plus the grey for unassigned / not picked yet.
  const nameOf = (email: string) => staff.find((s) => s.email.toLowerCase() === email)?.name ?? email;
  const legend = Object.entries(colors)
    .map(([email, hex]) => ({ name: nameOf(email), hex }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const btn = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => step(-1)} className={btn}>
          ‹
        </button>
        <h2 className="min-w-[10rem] text-center text-lg font-semibold text-slate-800">
          {MONTHS[view.m - 1]} {view.y}
        </h2>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => step(1)} className={btn}>
          ›
        </button>
        <button type="button" onClick={() => setView({ y: ty, m: tm })} className={btn}>
          Today
        </button>
        <div className="ml-auto flex items-center gap-2">
          {me && (
            <MyColor
              me={me.toLowerCase()}
              colors={colors}
              nameOf={nameOf}
              onSaved={(hex) => setColors((c) => ({ ...c, [me.toLowerCase()]: hex }))}
            />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              + Add event
            </button>
          )}
        </div>
      </div>

      <div aria-label="Colors" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {legend.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.hex }} />
            {l.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NO_COLOR }} />
          Unassigned
        </span>
        <span className="inline-flex items-center gap-1 text-red-600">
          <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-red-500" />
          Overdue
        </span>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Month grid (hidden on phones — the list below has everything). */}
      <div className="mb-6 hidden overflow-hidden rounded-lg border border-slate-200 bg-white sm:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div
              key={d ?? `blank-${i}`}
              className={`min-h-[5.5rem] border-b border-r border-slate-100 p-1 ${d ? "" : "bg-slate-50/60"} ${d === today ? "ring-2 ring-inset ring-brand-400" : ""}`}
            >
              {d && <div className="mb-0.5 text-right text-xs text-slate-400">{Number(d.slice(8))}</div>}
              {d &&
                occ
                  .filter((o) => o.date === d)
                  .map((o) => {
                    const e = byId.get(o.eventId);
                    return (
                      <div
                        key={keyOf(o)}
                        title={e ? `${e.title} (${ruleBadge(e)})${e.ownerName ? ` · ${e.ownerName}` : ""}` : ""}
                        style={chipStyle(colorOf(e?.ownerEmail))}
                        className={`mb-0.5 truncate rounded px-1 py-0.5 text-[11px] font-medium ${chipStatus(o)}`}
                      >
                        {e?.title}
                      </div>
                    );
                  })}
            </div>
          ))}
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Tasks this month</h3>
      {listed.length === 0 ? (
        <p className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">Nothing due this month.</p>
      ) : (
        <ul className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {listed.map((o) => {
            const e = byId.get(o.eventId);
            if (!e) return null;
            const s = statuses[keyOf(o)];
            const overdue = !s && o.date < today;
            return (
              <li key={keyOf(o)} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  aria-label={`done-${o.eventId}-${o.period}`}
                  checked={!!s}
                  onChange={() => toggle(o)}
                  className="mt-0.5 h-4 w-4 accent-brand-500"
                />
                <div className="w-24 shrink-0 text-slate-500">{fmtDay(o.date)}</div>
                <div className="min-w-0 flex-1">
                  <div className={`font-medium ${s ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {e.title}{" "}
                    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-normal text-slate-500 no-underline">{ruleBadge(e)}</span>
                    {overdue && <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Overdue</span>}
                  </div>
                  {e.description && <div className="mt-0.5 text-xs text-slate-500">{e.description}</div>}
                  {s && <div className="mt-0.5 text-xs text-emerald-700">Done by {s.doneByName} · {fmtDoneAt(s.doneAt)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(e.ownerEmail) }} />
                  {e.ownerName ?? "Unassigned"}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">All events</h3>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {events.map((e) => {
              const parsed = parseRule(e.rule);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{e.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{ruleBadge(e)}</span>
                  <span className="text-xs text-slate-500">
                    {isPerDay(e) ? repeatsText(e) : `${parsed.ok ? describeRule(parsed.rule) : "Unreadable rule"} · ${repeatsText(e)}`}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">{e.ownerName ?? "Unassigned"}</span>
                  <button
                    type="button"
                    aria-label={`edit-event-${e.id}`}
                    onClick={() => setEditing(e)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                </li>
              );
            })}
            {events.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">No events yet.</li>}
          </ul>
          <EveryonesColors
            staff={staff}
            colors={colors}
            onSaved={(email, hex, moved) =>
              setColors((c) => ({ ...c, [email]: hex, ...(moved ? { [moved.email]: moved.color } : {}) }))
            }
          />
          <DigestSettings initial={digestTo} />
        </>
      )}

      {editing && (
        <EventEditor
          event={editing === "new" ? null : editing}
          staff={staff}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEvents((prev) => (prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved]));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setEvents((prev) => prev.filter((e) => e.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EventEditor({
  event,
  staff,
  today,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: CalendarEvent | null;
  staff: StaffMember[];
  today: string;
  onClose: () => void;
  onSaved: (e: CalendarEvent) => void;
  onDeleted: (id: number) => void;
}) {
  const ids = useId();
  const [title, setTitle] = useState(event?.title ?? "");
  const [rule, setRule] = useState(event?.rule ?? "");
  const [frequency, setFrequency] = useState<Frequency>(event?.frequency ?? "monthly");
  const [month, setMonth] = useState<string>(event?.month ? String(event.month) : "");
  const [adjust, setAdjust] = useState<Adjust>(event?.adjust ?? "prior");
  const [ownerEmail, setOwnerEmail] = useState(event?.ownerEmail ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(event?.frequency === "weekly" ? parseWeekdays(event.rule) ?? [] : []);

  const daily = frequency === "daily";
  const weekly = frequency === "weekly";
  const perDay = daily || weekly;
  const parsed = !perDay && rule.trim() ? parseRule(rule) : null;
  const monthNum = frequency === "monthly" || perDay ? null : Number(month) || null;
  const monthOk = frequency === "monthly" || perDay || monthNum !== null;
  const ruleOk = daily || (weekly ? weekdays.length > 0 : !!parsed?.ok);
  const savedRule = daily ? DAILY_RULE : weekly ? formatWeekdays(weekdays) : rule;
  const next = useMemo(() => {
    if (!ruleOk || !monthOk) return [];
    return occurrencesBetween([{ id: -1, rule: savedRule, frequency, month: monthNum, adjust }], today, addDays(today, perDay ? 21 : 800)).slice(0, 3);
  }, [ruleOk, monthOk, savedRule, frequency, monthNum, adjust, today, perDay]);
  const canSave = !busy && !!title.trim() && ruleOk && monthOk;
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => a - b)));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(event ? `/api/calendar/events/${event.id}` : "/api/calendar/events", {
        method: event ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, rule: savedRule, frequency, month: monthNum, adjust, ownerEmail, ...(weekly ? { weekdays } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.event) throw new Error(typeof d?.error === "string" ? d.error : "Couldn't save the event.");
      onSaved(d.event as CalendarEvent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the event.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Couldn't delete the event.");
      onDeleted(event.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the event.");
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500";
  const label = "mb-1 block text-xs font-medium text-slate-600";
  const btn = "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Modal
      title={event ? "Edit event" : "Add event"}
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        <>
          {event && (
            <button type="button" disabled={busy} onClick={remove} className={`${btn} mr-auto border-slate-300 bg-white text-slate-600 hover:text-red-600`}>
              {confirmDelete ? "Click again to delete" : "Delete"}
            </button>
          )}
          <button type="button" onClick={onClose} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button type="button" disabled={!canSave} onClick={save} className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}>
            Save event
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={`${ids}-title`} className={label}>
            Name
          </label>
          <input id={`${ids}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={input} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-freq`} className={label}>
              Repeats
            </label>
            <select
              id={`${ids}-freq`}
              value={frequency}
              onChange={(e) => {
                setFrequency(e.target.value as Frequency);
                setMonth("");
                // Leaving a per-day schedule: ask for a real date rule.
                if (rule.trim().toUpperCase() === DAILY_RULE || parseWeekdays(rule)) setRule("");
              }}
              className={input}
            >
              <option value="daily">Every business day</option>
              <option value="weekly">Weekly on certain days</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {frequency !== "monthly" && !perDay && (
            <div>
              <label htmlFor={`${ids}-month`} className={label}>
                Month
              </label>
              <select id={`${ids}-month`} value={month} onChange={(e) => setMonth(e.target.value)} className={input}>
                <option value="">Pick…</option>
                {(frequency === "yearly" ? MONTHS : QUARTER_MONTHS).map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {perDay ? (
          <div className="text-xs text-slate-600">
            {weekly && (
              <div className="mb-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((name, i) => (
                  <label
                    key={name}
                    className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-sm ${
                      weekdays.includes(i + 1) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    <input type="checkbox" checked={weekdays.includes(i + 1)} onChange={() => toggleDay(i + 1)} className="h-3.5 w-3.5 accent-brand-500" />
                    {name}
                  </label>
                ))}
              </div>
            )}
            {weekly && weekdays.length === 0 ? (
              <p className="text-amber-700">Pick the days it happens.</p>
            ) : (
              <p>
                {daily ? "Every business day" : describeWeekdays(weekdays)} · Next: {next.map((o) => fmtDay(o.date)).join(", ")}
              </p>
            )}
            <p className="mt-0.5 text-slate-500">
              {daily ? "Skips weekends and bank holidays." : "A chosen day that's a bank holiday is skipped that week."} Each day is checked off on its own.
            </p>
          </div>
        ) : (
        <div>
          <label htmlFor={`${ids}-rule`} className={label}>
            Date rule
          </label>
          <input
            id={`${ids}-rule`}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="e.g. ME-5"
            className={`${input} font-mono`}
          />
          <div className="mt-1 text-xs">
            {parsed && !parsed.ok && <span className="text-red-600">{parsed.error}</span>}
            {parsed?.ok && (
              <span className="text-slate-600">
                {describeRule(parsed.rule)}
                {next.length > 0 && <> · Next: {next.map((o) => fmtDay(o.date)).join(", ")}</>}
              </span>
            )}
          </div>
          <details className="mt-1 text-xs text-slate-500">
            <summary className="cursor-pointer">How to write a rule</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
              <li>ME — last day of the month</li>
              <li>ME-5 — 5 calendar days before month end</li>
              <li>ME-5BD — 5 business days before month end</li>
              <li>MS+3 / MS+3BD — 3 (business) days after the 1st</li>
              <li>D10 — the 10th</li>
              <li>BD3 — 3rd business day · BD-1 — last business day</li>
            </ul>
            <p className="mt-1">Business days skip weekends and bank holidays.</p>
          </details>
        </div>
        )}

        {!perDay && (
        <div>
          <label htmlFor={`${ids}-adjust`} className={label}>
            Weekends &amp; holidays
          </label>
          <select id={`${ids}-adjust`} value={adjust} onChange={(e) => setAdjust(e.target.value as Adjust)} className={input}>
            <option value="prior">Move to the business day before</option>
            <option value="next">Move to the business day after</option>
            <option value="none">Keep the date</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">Only matters for calendar-day rules; business-day rules always land on a business day.</p>
        </div>
        )}

        <div>
          <label htmlFor={`${ids}-owner`} className={label}>
            Owner
          </label>
          <select id={`${ids}-owner`} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={input}>
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.email} value={s.email}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">They get an alert the morning it&apos;s due (if they&apos;ve turned on calendar alerts).</p>
        </div>

        <div>
          <label htmlFor={`${ids}-desc`} className={label}>
            Notes
          </label>
          <textarea id={`${ids}-desc`} rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} className={input} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

// Admins: who gets the daily summary email (6am ET, business days), and a
// "Send now" to check it.
function DigestSettings({ initial }: { initial: string[] }) {
  const id = useId();
  const [value, setValue] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(url: string, init: RequestInit, done: (d: Record<string, unknown>) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, init);
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Something went wrong.");
      setMsg({ ok: true, text: done(d) });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    call("/api/calendar/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digestTo: value }) }, (d) => {
      const list = Array.isArray(d.digestTo) ? (d.digestTo as string[]) : [];
      setValue(list.join(", "));
      return list.length ? "Saved." : "Saved — no one will get the summary.";
    });
  const sendNow = () =>
    call("/api/calendar/digest", { method: "POST" }, (d) => `Sent to ${Array.isArray(d.sentTo) ? (d.sentTo as string[]).join(", ") : "the list"}.`);

  const btn = "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor={`${id}-to`} className="block text-sm font-semibold text-slate-800">
        Daily summary email to
      </label>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        6am Eastern on business days: today&apos;s calendar tasks, overdue ones still open, and alerts (new/urgent work orders,
        returned payments, draws ready to batch, sync problems). Separate addresses with commas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${id}-to`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="name@example.com"
          className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <button type="button" disabled={busy} onClick={save} className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}>
          Save recipients
        </button>
        <button type="button" disabled={busy} onClick={sendNow} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
          Send now
        </button>
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}

// Pick your own calendar color. Colors someone else has are disabled (and the
// server refuses them too), so no two people share one.
function MyColor({
  me,
  colors,
  nameOf,
  onSaved,
}: {
  me: string;
  colors: Record<string, string>;
  nameOf: (email: string) => string;
  onSaved: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = colors[me];
  const holderOf = (hex: string) => Object.entries(colors).find(([email, c]) => c.toLowerCase() === hex.toLowerCase() && email !== me)?.[0];

  async function pick(hex: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: hex }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Couldn't save your color.");
      onSaved(hex);
      setMsg({ ok: true, text: "Your color is saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save your color." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="My color"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: mine ?? NO_COLOR }} />
        My color
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-500">Pick your color. Colors other people have are greyed out.</p>
          <div className="grid grid-cols-6 gap-1.5">
            {CALENDAR_COLORS.map((c) => {
              const holder = holderOf(c.hex);
              const isMine = mine?.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  disabled={busy || !!holder}
                  aria-label={holder ? `${c.name} — taken by ${nameOf(holder)}` : c.name}
                  aria-pressed={isMine}
                  title={holder ? `${c.name} — taken by ${nameOf(holder)}` : c.name}
                  onClick={() => pick(c.hex)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-25 ${
                    isMine ? "ring-2 ring-slate-800 ring-offset-1" : ""
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {isMine ? "✓" : ""}
                </button>
              );
            })}
          </div>
          {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

// Admins: set anyone's color. Someone holding a color only automatically is
// moved to the next free one; a color someone chose themselves can't be taken.
function EveryonesColors({
  staff,
  colors,
  onSaved,
}: {
  staff: StaffMember[];
  colors: Record<string, string>;
  onSaved: (email: string, hex: string, moved?: { email: string; color: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameOf = (email: string) => staff.find((s) => s.email.toLowerCase() === email)?.name ?? email;
  const holderOf = (hex: string, except: string) =>
    Object.entries(colors).find(([e, c]) => c.toLowerCase() === hex.toLowerCase() && e !== except)?.[0];

  async function set(person: StaffMember, hex: string) {
    const email = person.email.toLowerCase();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, color: hex }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : "Couldn't save the color.");
      onSaved(email, hex, d.moved);
      setMsg({
        ok: true,
        text: `${person.name} is ${colorName(hex)}.${d.moved ? ` ${nameOf(d.moved.email)} moved to ${colorName(d.moved.color)}.` : ""}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save the color." });
    } finally {
      setBusy(false);
    }
  }

  if (staff.length === 0) return null;
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">Everyone&apos;s colors</h3>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">
        People without a color get one automatically; anyone can change theirs with My color. A color someone picked
        themselves can&apos;t be given to someone else.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {staff.map((p) => {
          const email = p.email.toLowerCase();
          const current = colors[email] ?? "";
          return (
            <label key={email} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: current || NO_COLOR }} />
              <span className="w-32 truncate">{p.name}</span>
              <select
                aria-label={`Color for ${p.name}`}
                value={current}
                disabled={busy}
                onChange={(e) => e.target.value && set(p, e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="" disabled>
                  No color
                </option>
                {CALENDAR_COLORS.map((c) => {
                  const holder = holderOf(c.hex, email);
                  return (
                    <option key={c.hex} value={c.hex}>
                      {c.name}
                      {holder ? ` (${nameOf(holder)})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          );
        })}
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
