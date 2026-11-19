// Tenant Turner lead replies, from its "New message from <lead>" notification
// emails. Tenant Turner's API has no messages resource, but it emails the
// assigned agent each time a lead texts back; a Google Apps Script in the
// shared Gmail posts those emails to /api/webhooks/tenantturner-messages.
// Pure parsing here; storage is ./messages-db.ts.
//
// The email (plain text) looks like:
//   Hi Paul,
//   You have a new unread message from Ann Lee waiting for you in your PMI Lighthouse account.
//   "Got it. Thanks for sending"
//   https://tracking.ttusermail.com/…

export type ParsedTtMessage = {
  leadName: string | null; // null for Tenant Turner's "Unknown Lead"
  agentName: string | null; // who Tenant Turner notified ("Hi Paul,")
  text: string; // the lead's words
};

const QUOTES = /^["“”]|["“”]$/g;

export function parseTtMessageEmail(email: { subject: string; body: string }): ParsedTtMessage | null {
  const subject = email.subject.trim().replace(/^((fwd?|fw)\s*:\s*)+/i, "");
  const lead = /^new message from (.+)$/i.exec(subject);
  if (!lead) return null;

  const body = email.body.replace(/\r\n/g, "\n");
  const intro = /waiting for you in your[^\n]*?account\.\s*/i.exec(body);
  if (!intro) return null;
  // The quoted message runs from after that sentence up to the tracking link.
  const rest = body.slice(intro.index + intro[0].length);
  const end = rest.search(/\n\s*(https?:\/\/|<https?:\/\/|Reply\s*$|No longer interested)/im);
  const quoted = (end >= 0 ? rest.slice(0, end) : rest).trim();
  if (!/^["“]/.test(quoted)) return null;
  const text = quoted.replace(QUOTES, "").trim();
  if (!text) return null;

  const leadName = lead[1].trim();
  const agent = /^\s*Hi ([^,\n]+),/im.exec(body);
  return {
    leadName: /^unknown lead$/i.test(leadName) ? null : leadName,
    agentName: agent ? agent[1].trim() : null,
    text,
  };
}
