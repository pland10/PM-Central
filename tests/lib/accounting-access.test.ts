import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting, canApproveOwnerDraws } from "@/lib/accounting-access";

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

describe("canApproveOwnerDraws", () => {
  it("allows the Basic-Auth operator and admins by default", () => {
    expect(canApproveOwnerDraws(null)).toBe(true);
    expect(canApproveOwnerDraws(user({ role: "admin" }))).toBe(true);
    expect(canApproveOwnerDraws(user({ role: "user" }))).toBe(false);
  });

  it("when OWNER_DRAW_APPROVER_EMAILS is set, only those people approve — admins too", () => {
    vi.stubEnv("OWNER_DRAW_APPROVER_EMAILS", "Boss@PMILighthouse.com, other@x.com");
    expect(canApproveOwnerDraws(user({ email: "boss@pmilighthouse.com" }))).toBe(true);
    expect(canApproveOwnerDraws(user({ role: "admin", email: "coordinator@x.com" }))).toBe(false);
    expect(canApproveOwnerDraws(null)).toBe(true);
  });
});
