import { describe, expect, it } from "vitest";
import { isAccountingStaff, transactionNoteEmail } from "@/lib/transaction-notes";

describe("isAccountingStaff", () => {
  const allowed = ["bookkeeper@pmi.com"];
  it("includes admins (role claim or the inspection app's admin flags)", () => {
    expect(isAccountingStaff({ role: "admin" }, "a@pmi.com", allowed)).toBe(true);
    expect(isAccountingStaff({ can_delete: true }, "b@pmi.com", allowed)).toBe(true);
    expect(isAccountingStaff({ can_edit_all: true }, "c@pmi.com", allowed)).toBe(true);
  });
  it("includes people named in ACCOUNTING_ALLOWED_EMAILS, case-insensitively", () => {
    expect(isAccountingStaff({}, "Bookkeeper@PMI.com", allowed)).toBe(true);
  });
  it("leaves everyone else out — the email holds card details", () => {
    expect(isAccountingStaff({ role: "inspector" }, "tech@pmi.com", allowed)).toBe(false);
    expect(isAccountingStaff(undefined, "", allowed)).toBe(false);
  });
});

describe("transactionNoteEmail", () => {
  it("names the charge, escapes the note and links back to Bank Transactions", () => {
    const e = transactionNoteEmail({
      date: "2026-11-04",
      merchant: "The Home Depot",
      account: "Home Depot Pro",
      amount: 27.06,
      property: "18-47 26th Rd, Astoria",
      author: "Jane Doe",
      body: "Receipt <attached> to QB\nOwner to repay",
      appUrl: "https://pmilighthouse.app/accounting",
    });
    expect(e.subject).toBe("Note on $27.06 · The Home Depot · Nov 4");
    expect(e.html).toContain("Jane Doe");
    expect(e.html).toContain("Home Depot Pro");
    expect(e.html).toContain("18-47 26th Rd, Astoria");
    expect(e.html).toContain("Receipt &lt;attached&gt; to QB<br>Owner to repay");
    expect(e.html).toContain('href="https://pmilighthouse.app/accounting"');
  });

  it("handles a credit and a charge with no property or date", () => {
    const e = transactionNoteEmail({ date: null, merchant: "Amazon", account: "Amex", amount: -12.5, property: "", author: "J", body: "x", appUrl: "u" });
    expect(e.subject).toBe("Note on -$12.50 · Amazon");
  });
});
