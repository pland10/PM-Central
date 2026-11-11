// The Home Depot Pro card lives on Citi's commercial card portal (no Plaid).
// scripts/sync-hd-invoices.ts signs in there daily with a headless browser and
// downloads the "Invoices by Statement Date" CSV. Pure helpers live here so
// they're unit-tested.

export const CITI_HD_START_URL =
  "https://www.retailservicescommercial.citi.com/USCRSF/CMLSVC/index.html?siteId=PLCR_HOMEDEPOT#stmt/statements";

// Page element ids on the portal (found Nov 2026 by probing).
export const CITI_HD_SELECTORS = {
  userId: "#userIDFieldID",
  password: 'input[type="password"]',
  signOff: "#signoffLink",
  viewInvoices: "#viewInvoicesHero",
  downloadList: "#downloadList", // opens a modal: format radio + Download
  csvRadio: "#csvRadio",
  downloadButton: "#btnDownload",
} as const;

export type CitiLoginOutcome = "ok" | "otp" | "bad_login" | "blocked" | "unknown";

// What happened after the one login attempt. The job never retries a failed
// login — repeated bad attempts lock a bank account.
export function classifyCitiLogin(p: { signedIn: boolean; passwordFieldVisible: boolean; text: string }): CitiLoginOutcome {
  if (p.signedIn && !p.passwordFieldVisible) return "ok";
  const t = p.text;
  if (/access denied|request blocked|are you a robot|captcha|unusual activity/i.test(t)) return "blocked";
  if (/one[- ]time|verification code|verify (your )?identity|security code|send (me )?a code/i.test(t)) return "otp";
  if (/incorrect|not recognized|invalid|doesn.t match|locked/i.test(t)) return "bad_login";
  return "unknown";
}
