import { describe, expect, it } from "vitest";
import { parseTtMessageEmail } from "@/lib/tenantturner/messages";

// The shape of Tenant Turner's "New message from …" notification (plain text).
const body = (agent: string, lead: string, text: string) =>
  `Hi ${agent},\n\nYou have a new unread message from ${lead} waiting for you in your PMI Lighthouse account.\n\n"${text}"\n\nhttps://tracking.ttusermail.com/f/a/abc~~/xyz~~`;

describe("parseTtMessageEmail", () => {
  it("pulls the lead, the agent it was sent to, and the lead's words", () => {
    expect(
      parseTtMessageEmail({
        subject: "New message from Ann Lee",
        body: body("Paul", "Ann Lee", "Got it. Thanks for sending"),
      })
    ).toEqual({ leadName: "Ann Lee", agentName: "Paul", text: "Got it. Thanks for sending" });
  });

  it("keeps quotes and line breaks inside the message", () => {
    const parsed = parseTtMessageEmail({
      subject: "New message from Ann Lee",
      body: body("Pam", "Ann Lee", 'Is the "bonus room" a bedroom?\nAlso, pets ok?'),
    });
    expect(parsed?.text).toBe('Is the "bonus room" a bedroom?\nAlso, pets ok?');
  });

  it("treats Unknown Lead as no name", () => {
    expect(
      parseTtMessageEmail({ subject: "New message from Unknown Lead", body: body("Paul", "Unknown Lead", "We found another rental") })
    ).toEqual({ leadName: null, agentName: "Paul", text: "We found another rental" });
  });

  it("handles a forwarded copy (Fwd: subject, footer text)", () => {
    const parsed = parseTtMessageEmail({
      subject: "Fwd: New message from Ann Lee",
      body: `---------- Forwarded message ---------\nFrom: Tenant Turner <email@ttusermail.com>\n\n${body("Ari", "Ann Lee", "See you at 3")}\n\nReply\nNo longer interested in receiving this type of email? Click here`,
    });
    expect(parsed).toEqual({ leadName: "Ann Lee", agentName: "Ari", text: "See you at 3" });
  });

  it("ignores other Tenant Turner emails", () => {
    expect(parseTtMessageEmail({ subject: "Tenant Turner Feature Spotlight", body: "Hi Paul" })).toBeNull();
    expect(parseTtMessageEmail({ subject: "New message from Ann Lee", body: "no quoted text here" })).toBeNull();
  });
});
