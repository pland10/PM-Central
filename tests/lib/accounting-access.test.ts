import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";

afterEach(() => vi.unstubAllEnvs());

const user = (over: Partial<AppUser> = {}): AppUser => ({
  id: "u1",
  email: "someone@pmilighthouse.com",
  name: "Someone",
  role: "user",
  canDelete: false,
  canEditAll: false,
  dashboardOrder: null,
  dashboardHidden: null,
  ...over,
});

describe("canAccessAccounting", () => {
  it("allows the Basic-Auth operator (no Supabase user)", () => {
    expect(canAccessAccounting(null)).toBe(true);
  });

  it("allows admins", () => {
    expect(canAccessAccounting(user({ role: "admin" }))).toBe(true);
  });

  it("denies non-admins by default", () => {
    expect(canAccessAccounting(user({ role: "user" }))).toBe(false);
    expect(canAccessAccounting(user({ role: "inspector" }))).toBe(false);
  });

  it("allows a non-admin whose email is in the allowlist (case-insensitive)", () => {
    vi.stubEnv("ACCOUNTING_ALLOWED_EMAILS", "book@pmilighthouse.com, other@x.com");
    expect(canAccessAccounting(user({ role: "user", email: "Book@PMILighthouse.com" }))).toBe(true);
    expect(canAccessAccounting(user({ role: "user", email: "nope@x.com" }))).toBe(false);
  });
});
