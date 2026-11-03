import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, bodyToHtml, formatBalance, normalizeTemplate, reminderAddress, renderTemplate, senderFrom } from "@/lib/reminders";

const recipient = { tenant: "Jordan Lee", property: "12 Oak St, Hempstead, NY", amount: 1234.5 };

describe("renderTemplate", () => {
  it("fills {tenant}, {property} and {balance}", () => {
    const out = renderTemplate("Dear {tenant}, you owe {balance} on {property}.", recipient);
    expect(out).toBe("Dear Jordan Lee, you owe $1,234.50 on 12 Oak St, Hempstead, NY.");
  });

  it("leaves unknown tokens untouched and falls back for blanks", () => {
    expect(renderTemplate("Hi {tenant} — {oops}", { tenant: "", property: "", amount: 0 })).toBe("Hi Resident — {oops}");
  });
});

describe("formatBalance", () => {
  it("formats to the cent", () => {
    expect(formatBalance(0)).toBe("$0.00");
    expect(formatBalance(999)).toBe("$999.00");
  });
});

describe("normalizeTemplate", () => {
  it("trims and keeps what's given", () => {
    expect(normalizeTemplate({ subject: "  Pay up  ", body: " Dear Resident " })).toEqual({ subject: "Pay up", body: "Dear Resident" });
  });

  it("falls back to the default when blank or missing", () => {
    expect(normalizeTemplate({ subject: "   ", body: "" })).toEqual(DEFAULT_TEMPLATE);
    expect(normalizeTemplate({})).toEqual(DEFAULT_TEMPLATE);
  });

  it("caps very long input", () => {
    expect(normalizeTemplate({ subject: "x".repeat(400), body: "y".repeat(9000) }).subject.length).toBe(300);
  });
});

describe("reminderAddress", () => {
  it("puts 'notifications' on the configured From's domain", () => {
    expect(reminderAddress("PMI Lighthouse <inspections@pmilighthouse.com>")).toBe("notifications@pmilighthouse.com");
    expect(reminderAddress("inspections@pmilighthouse.app")).toBe("notifications@pmilighthouse.app");
  });
});

describe("senderFrom", () => {
  it("puts the sender's name on the verified domain address", () => {
    expect(senderFrom("John Ray", "PMI Lighthouse <inspections@pmilighthouse.app>")).toBe("John Ray <inspections@pmilighthouse.app>");
  });
  it("handles a bare address and strips angle brackets from the name", () => {
    expect(senderFrom("John <Ray>", "notify@x.app")).toBe("John Ray <notify@x.app>");
  });
  it("falls back to the configured From when the name is empty", () => {
    expect(senderFrom("  ", "PMI <a@b.app>")).toBe("PMI <a@b.app>");
  });
});

describe("bodyToHtml", () => {
  it("escapes HTML and preserves line breaks via pre-wrap", () => {
    const html = bodyToHtml("Hi <b>there</b>\nLine 2");
    expect(html).toContain("Hi &lt;b&gt;there&lt;/b&gt;\nLine 2");
    expect(html).toContain("white-space:pre-wrap");
    expect(html).not.toContain("<b>there</b>");
  });
});
