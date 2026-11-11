import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { chromium } from "playwright";
import { CITI_HD_SELECTORS as S, CITI_HD_START_URL, classifyCitiLogin } from "../src/lib/citi-hd-portal";
import { parseHdInvoicesCsv } from "../src/lib/hd-invoices";
import { upsertHdInvoices } from "../src/lib/hd-invoices-db";

// Home Depot Pro card (Citi) → Accounting → Bank Transactions, daily.
//
// The card isn't on Plaid, so a headless browser signs in to Citi's commercial
// card site, opens View Invoices → Download List → CSV — the same "Invoices by
// Statement Date" file the Import Home Depot button takes — and saves it with
// the same upsert. Runs from sync-hd-invoices.yml (daily tier + the Data
// page's Refresh).
//
//   HD_PRO_EMAIL / HD_PRO_PASSWORD   the Citi login (GitHub secrets)
//
// Safety: ONE login attempt per run, never retried (repeated failures lock a
// bank account). The repo's Actions logs are public: counts only — never page
// text, invoice data or screenshots.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function downloadInvoicesCsv(user: string, pass: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    await page.goto(CITI_HD_START_URL, { timeout: 60_000, waitUntil: "domcontentloaded" });

    const id = page.locator(S.userId);
    const pw = page.locator(`${S.password}:visible`);
    await id.waitFor({ timeout: 30_000 });
    if ((await pw.count()) !== 1) throw new Error("Citi sign-in form not as expected — not attempting to log in.");

    await id.click();
    await id.pressSequentially(user, { delay: 50 });
    await pw.click();
    await pw.pressSequentially(pass, { delay: 50 });
    await pw.press("Enter");

    // Wait for either the signed-in page or the form to settle.
    await page.locator(S.signOff).waitFor({ timeout: 30_000 }).catch(() => {});
    const outcome = classifyCitiLogin({
      signedIn: (await page.locator(S.signOff).count()) > 0,
      passwordFieldVisible: (await page.locator(`${S.password}:visible`).count()) > 0,
      text: await page.locator("body").innerText().catch(() => ""),
    });
    if (outcome !== "ok") {
      const why: Record<string, string> = {
        otp: "Citi asked for a one-time code — sign in once by hand from a browser, then re-run.",
        bad_login: "Citi rejected the login — check the HD_PRO_EMAIL / HD_PRO_PASSWORD secrets (not retrying, to avoid a lockout).",
        blocked: "Citi blocked the automated browser.",
        unknown: "Citi sign-in didn't reach the account page.",
      };
      throw new Error(`Login ${outcome}: ${why[outcome]}`);
    }
    console.log("Signed in to Citi.");

    await page.locator(S.viewInvoices).click();
    await page.locator(S.downloadList).waitFor({ timeout: 30_000 });
    await page.locator(S.downloadList).click();
    await page.locator(S.csvRadio).waitFor({ timeout: 15_000 });
    await page.locator(S.csvRadio).check({ force: true });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.locator(S.downloadButton).click(),
    ]);
    const path = join(tmpdir(), `hd-invoices-${Date.now()}.csv`);
    await download.saveAs(path);

    // Leave cleanly so the session doesn't linger.
    await page.locator(S.signOff).click({ timeout: 5_000 }).catch(() => {});
    return readFileSync(path, "utf8");
  } finally {
    await browser.close();
  }
}

async function main() {
  const user = process.env.HD_PRO_EMAIL ?? "";
  const pass = process.env.HD_PRO_PASSWORD ?? "";
  if (!user || !pass) throw new Error("HD_PRO_EMAIL / HD_PRO_PASSWORD are not set.");

  const csv = await downloadInvoicesCsv(user, pass);
  const { rows, errors } = parseHdInvoicesCsv(csv);
  console.log(`Downloaded ${rows.length} invoice(s)${errors.length ? `, ${errors.length} unreadable line(s)` : ""}.`);

  const prisma = new PrismaClient();
  try {
    const { imported, updated } = await upsertHdInvoices(prisma, rows);
    console.log(`Saved: ${imported} new, ${updated} already imported.`);
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('hd_invoices', now(), ${`${rows.length} invoices (${imported} new)`})
        ON CONFLICT (job) DO UPDATE
          SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`);
    } catch (e) {
      console.log(`  [warn] could not write sync_status heartbeat: ${e instanceof Error ? e.message : e}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // Error messages above are written to be safe for public logs.
  console.error("\nHome Depot invoice sync failed:", e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : e);
  process.exit(1);
});
