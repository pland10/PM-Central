import { sendEmail, type SendEmailResult } from "@/lib/email";
import { buildDailySummary } from "@/lib/calendar/daily-summary";
import { gatherDailySummary } from "@/lib/calendar/daily-summary-live";

// The app's address for links in the email (the cron's own request URL may be a
// Vercel deployment URL, not the public site).
export const appBaseUrl = () => (process.env.APP_URL || "https://pmilighthouse.app").replace(/\/$/, "");

export async function sendDailySummary(to: string[], appUrl: string, now = new Date()): Promise<SendEmailResult> {
  const { subject, html } = buildDailySummary(await gatherDailySummary(now), appUrl);
  return sendEmail({ to, subject, html });
}
