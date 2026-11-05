// Outbound-text email alerts: whenever a text goes OUT of LeadSimple, email it
// to the team (otherwise outbound texts are invisible unless someone opens
// LeadSimple). Ported from leadsimple-search's text_notifier.py and run by
// Vercel Cron every 5 minutes (/api/cron/text-alerts).
//
// The watermark lives in Neon's text_notify_state (row id 1) — the same row the
// Python version used — so the two never double-send while both exist.
// Pure orchestration here (deps injected) so it's testable; the real deps are
// in text-alerts-live.ts.

export type LsText = {
  id: string;
  direction?: string;
  to?: string;
  from?: string;
  body?: string;
  description?: string;
  created_at?: string;
};
export type CollapsedText = LsText & { attachments: number };
export type Alert = { subject: string; html: string };

export type TextAlertDeps = {
  loadState: () => Promise<{ since: string | null; sentIds: string[] }>;
  saveState: (since: string, sentIds: string[]) => Promise<void>;
  fetchPage: (page: number) => Promise<LsText[]>; // newest first
  phoneRows: () => Promise<{ deal_name: string; contact_phones: string }[]>;
  send: (alert: Alert) => Promise<boolean>;
  heartbeat: (detail: string) => Promise<void>;
  recipients: string[];
  now?: () => Date;
};

const MAX_PAGES = 60; // 200 per page — well over a year of texts
const MAX_EMAILS_PER_RUN = 25; // a burst shouldn't flood the inbox
const ATTACHMENT_WINDOW_MS = 120_000;

const digits = (raw?: string) => (raw ?? "").replace(/\D/g, "").slice(-10);
const bodyOf = (m: LsText) => (m.body || m.description || "").trim();
const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// A text with images is stored as one record with the body plus one empty
// record per attachment, seconds apart. Fold those into the text they belong
// to; an empty record with nothing to attach to is dropped.
export function collapseAttachments(messages: LsText[]): CollapsedText[] {
  const kept: CollapsedText[] = [];
  for (const m of messages) {
    if (bodyOf(m)) {
      kept.push({ ...m, attachments: 0 });
      continue;
    }
    for (let i = kept.length - 1; i >= 0; i--) {
      const earlier = kept[i];
      if (earlier.to !== m.to) continue;
      const gap = Date.parse(m.created_at ?? "") - Date.parse(earlier.created_at ?? "");
      if (gap >= 0 && gap <= ATTACHMENT_WINDOW_MS) earlier.attachments++;
      break;
    }
  }
  return kept;
}

// Phone (last 10 digits) -> deal name. Where several deals share a number,
// prefer the one with the fewest numbers — bulk deals like "Mail Merge" would
// otherwise win every lookup.
export function phoneBook(rows: { deal_name: string; contact_phones: string }[]): Map<string, string> {
  const best = new Map<string, { count: number; name: string }>();
  for (const r of rows) {
    const phones = (r.contact_phones || "").split(",").filter((p) => p.trim());
    for (const p of phones) {
      const d = digits(p);
      if (!d) continue;
      const cur = best.get(d);
      if (!cur || phones.length < cur.count) best.set(d, { count: phones.length, name: r.deal_name });
    }
  }
  return new Map([...best].map(([d, v]) => [d, v.name]));
}

function formatPhone(raw?: string): string {
  const d = digits(raw);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw || "unknown";
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function nyTime(iso?: string): string {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return iso ?? "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }).format(d);
}

export function buildAlert(m: CollapsedText, book: Map<string, string>): Alert {
  const who = book.get(digits(m.to)) ?? "";
  const label = who ? `${who} (${formatPhone(m.to)})` : formatPhone(m.to);
  const rows: [string, string][] = [
    ["To", label],
    ["From", formatPhone(m.from)],
    ["Sent", nyTime(m.created_at)],
    ...(m.attachments ? ([["Attachments", String(m.attachments)]] as [string, string][]) : []),
  ];
  const html =
    `<p>An outbound text was sent from LeadSimple.</p>` +
    `<p>${rows.map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join("<br>")}</p>` +
    `<p><b>Message:</b><br>${esc(bodyOf(m)).replace(/\n/g, "<br>")}</p>`;
  return { subject: `Outbound text to ${label}`, html };
}

export type RunResult = { sent: number; watchingFrom?: string; skipped?: string };

export async function runTextAlerts(d: TextAlertDeps): Promise<RunResult> {
  if (d.recipients.length === 0) return { sent: 0, skipped: "no recipients configured" };
  const now = d.now ?? (() => new Date());
  const { since, sentIds } = await d.loadState();

  // First run: start watching from now, so there's no flood of old texts.
  if (!since) {
    const from = isoSeconds(now());
    await d.saveState(from, []);
    await d.heartbeat("started watching");
    return { sent: 0, watchingFrom: from };
  }

  // Page back (newest first) until we pass the watermark.
  const found: LsText[] = [];
  let sawCutoff = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await d.fetchPage(page);
    if (batch.length === 0) {
      sawCutoff = true; // nothing older to miss
      break;
    }
    let reached = false;
    for (const m of batch) {
      if ((m.created_at ?? "") <= since) {
        reached = true;
        continue;
      }
      if (m.direction === "outbound") found.push(m);
    }
    if (reached) {
      sawCutoff = true;
      break;
    }
  }

  found.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const seen = new Set(sentIds);
  const fresh = collapseAttachments(found).filter((m) => !seen.has(m.id)).slice(0, MAX_EMAILS_PER_RUN);
  if (fresh.length === 0) {
    await d.heartbeat("0 alerts");
    return { sent: 0, watchingFrom: since };
  }

  const book = phoneBook(await d.phoneRows().catch(() => []));
  const sent: CollapsedText[] = [];
  for (const m of fresh) {
    if (!(await d.send(buildAlert(m, book)))) break; // stop; retry the rest next run
    sent.push(m);
  }
  if (sent.length === 0) return { sent: 0, watchingFrom: since };

  // Advance only as far as what went out, and only if we saw back to the old
  // watermark (otherwise older unsent texts may be waiting).
  const ids = [...new Set([...sentIds, ...sent.map((m) => m.id)])].sort().slice(-500);
  const newest = sawCutoff ? sent[sent.length - 1].created_at ?? since : since;
  await d.saveState(newest, ids);
  await d.heartbeat(`${sent.length} alert(s) sent`);
  return { sent: sent.length, watchingFrom: newest };
}
