import { describe, expect, it } from "vitest";
import { classifyCitiLogin } from "@/lib/citi-hd-portal";

describe("classifyCitiLogin", () => {
  it("is ok once the Sign Off link shows and the password box is gone", () => {
    expect(classifyCitiLogin({ signedIn: true, passwordFieldVisible: false, text: "Statements Recent Activity" })).toBe("ok");
  });

  it("spots a one-time-code challenge (never retried — a person has to sign in once)", () => {
    expect(
      classifyCitiLogin({ signedIn: false, passwordFieldVisible: false, text: "To verify your identity we'll send a one-time code" })
    ).toBe("otp");
  });

  it("spots a rejected login so the job stops instead of retrying into a lockout", () => {
    expect(
      classifyCitiLogin({ signedIn: false, passwordFieldVisible: true, text: "The User ID or Password you entered is incorrect." })
    ).toBe("bad_login");
    expect(classifyCitiLogin({ signedIn: false, passwordFieldVisible: true, text: "Your account is locked." })).toBe("bad_login");
  });

  it("spots a bot block", () => {
    expect(classifyCitiLogin({ signedIn: false, passwordFieldVisible: false, text: "Access Denied" })).toBe("blocked");
  });

  it("falls back to unknown", () => {
    expect(classifyCitiLogin({ signedIn: false, passwordFieldVisible: false, text: "Something else" })).toBe("unknown");
  });
});
