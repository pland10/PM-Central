import { beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { jsonResponse } from "../helpers/fetch";

let resend: ReturnType<typeof vi.fn>;
const sentBody = () => JSON.parse(String(resend.mock.calls[0][1].body));

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM", "");
  resend = vi.fn(async () => jsonResponse({ id: "email-1" }));
  vi.stubGlobal("fetch", resend);
});

describe("sendEmail", () => {
  it("posts to Resend with the API key and a normalized recipient list", async () => {
    const result = await sendEmail({ to: "info@pmilighthouse.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result).toEqual({ ok: true, id: "email-1" });
    const [url, init] = resend.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(sentBody()).toEqual({
      from: "PMI Lighthouse <inspections@pmilighthouse.app>",
      to: ["info@pmilighthouse.com"],
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("uses RESEND_FROM, and an explicit from over that", async () => {
    vi.stubEnv("RESEND_FROM", "Ops <ops@pmilighthouse.app>");
    await sendEmail({ to: ["a@x.com"], subject: "s", html: "h" });
    expect(sentBody().from).toBe("Ops <ops@pmilighthouse.app>");

    resend.mockClear();
    await sendEmail({ to: ["a@x.com"], subject: "s", html: "h", from: "Me <me@pmilighthouse.app>" });
    expect(sentBody().from).toBe("Me <me@pmilighthouse.app>");
  });

  it("maps reply-to and attachments to Resend's field names", async () => {
    await sendEmail({
      to: "a@x.com",
      subject: "s",
      html: "h",
      replyTo: "owner@x.com",
      attachments: [{ filename: "p.jpg", content: "YmFzZTY0", contentType: "image/jpeg" }, { filename: "n.txt", content: "eA==" }],
    });

    expect(sentBody()).toMatchObject({
      reply_to: "owner@x.com",
      attachments: [
        { filename: "p.jpg", content: "YmFzZTY0", content_type: "image/jpeg" },
        { filename: "n.txt", content: "eA==" },
      ],
    });
  });

  it("returns 503 without calling Resend when not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isEmailConfigured()).toBe(false);
    expect(await sendEmail({ to: "a@x.com", subject: "s", html: "h" })).toMatchObject({ ok: false, status: 503 });
    expect(resend).not.toHaveBeenCalled();
  });

  it("passes through a Resend rejection", async () => {
    resend.mockResolvedValue(jsonResponse({ message: "domain not verified" }, { status: 403 }));
    const result = await sendEmail({ to: "a@x.com", subject: "s", html: "h" });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(!result.ok && result.error).toMatch(/domain not verified/);
  });

  it("returns 502 on a network failure", async () => {
    resend.mockRejectedValue(new Error("ECONNRESET"));
    expect(await sendEmail({ to: "a@x.com", subject: "s", html: "h" })).toEqual({ ok: false, status: 502, error: "ECONNRESET" });
  });
});
