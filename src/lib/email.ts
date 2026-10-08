// Minimal transactional-email sender via Resend's REST API (no SDK dependency).
// Needs RESEND_API_KEY. The default From address is configurable via RESEND_FROM
// and must be on a domain verified in Resend (e.g. pmilighthouse.app).

export type EmailAttachment = {
  filename: string;
  content: string; // base64-encoded bytes
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = { ok: true; id?: string } | { ok: false; status: number; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const DEFAULT_FROM = "PMI Lighthouse <inspections@pmilighthouse.app>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "Email isn't configured — set RESEND_API_KEY." };
  }
  const from = input.from || process.env.RESEND_FROM || DEFAULT_FROM;
  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: data.id };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `Resend error (HTTP ${res.status}). ${text.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "Email request failed." };
  }
}
