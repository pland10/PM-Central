import { describe, expect, it } from "vitest";
import { matchStaffEmail, noteEmail, normalizeNoteBody, resolveRecipients } from "@/lib/work-order-notes";

describe("normalizeNoteBody", () => {
  it("trims, rejects empty and caps the length", () => {
    expect(normalizeNoteBody("  Call the plumber again \n")).toBe("Call the plumber again");
    expect(normalizeNoteBody("   ")).toBeNull();
    expect(normalizeNoteBody(5)).toBeNull();
    expect(normalizeNoteBody("x".repeat(9000))?.length).toBe(4000);
  });
});

describe("matchStaffEmail", () => {
  const staff = [
    { name: "Jasper Jed Belen", email: "jasper@pmi.com" },
    { name: "Paul Landman", email: "paul@pmi.com" },
  ];
  it("finds the assignee's email by name, ignoring case and extra spaces", () => {
    expect(matchStaffEmail(" jasper  jed belen ", staff)).toBe("jasper@pmi.com");
  });
  it("is empty when the assignee isn't a PM-Central user", () => {
    expect(matchStaffEmail("Someone Else", staff)).toBe("");
    expect(matchStaffEmail("", staff)).toBe("");
  });
});

describe("noteEmail", () => {
  it("names the work order and author, escapes the note, and links back", () => {
    const e = noteEmail({
      number: "100480",
      issue: "Garage door wire broke",
      property: "109 Chase Road, Manhasset",
      author: "Paul Landman",
      body: "Vendor <ABC> says Tue\nPlease confirm",
      appUrl: "https://pmilighthouse.app/work-orders",
      leadSimpleUrl: "https://app.leadsimple.com/x",
    });
    expect(e.subject).toBe("Note on WO #100480 — Garage door wire broke");
    expect(e.html).toContain("Paul Landman");
    expect(e.html).toContain("Vendor &lt;ABC&gt; says Tue<br>Please confirm");
    expect(e.html).toContain('href="https://pmilighthouse.app/work-orders"');
    expect(e.html).toContain('href="https://app.leadsimple.com/x"');
    expect(e.html).not.toContain("<ABC>");
  });
});

describe("resolveRecipients", () => {
  const staff = [
    { name: "Jasper Jed Belen", email: "jasper@pmi.com" },
    { name: "Paul Landman", email: "Paul@pmi.com" },
  ];
  it("accepts one address or a list, case-insensitively, deduped, in staff spelling", () => {
    expect(resolveRecipients("JASPER@pmi.com", staff)).toEqual({ emails: ["jasper@pmi.com"] });
    expect(resolveRecipients(["paul@pmi.com", "jasper@pmi.com", "Paul@PMI.com"], staff)).toEqual({
      emails: ["Paul@pmi.com", "jasper@pmi.com"],
    });
  });
  it("nobody to email: missing, empty string or empty list", () => {
    for (const raw of [undefined, null, "", "  ", []]) expect(resolveRecipients(raw, staff)).toEqual({ emails: [] });
  });
  it("rejects the whole request if any address isn't on the staff list", () => {
    expect(resolveRecipients(["jasper@pmi.com", "stranger@gmail.com"], staff)).toEqual({ error: "unknown" });
    expect(resolveRecipients("stranger@gmail.com", staff)).toEqual({ error: "unknown" });
  });
  it("rejects junk shapes and more than 20 people", () => {
    expect(resolveRecipients(5, staff)).toEqual({ error: "invalid" });
    expect(resolveRecipients(["jasper@pmi.com", 3], staff)).toEqual({ error: "invalid" });
    expect(resolveRecipients(Array(21).fill("jasper@pmi.com"), staff)).toEqual({ error: "invalid" });
  });
});
