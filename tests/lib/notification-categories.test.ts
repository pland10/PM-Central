import { describe, expect, it } from "vitest";
import { canUseCategory, categoriesForRole, NOTIFICATION_CATEGORIES } from "@/lib/notification-categories";

describe("notification categories", () => {
  it("admins see every category; non-admins only the non-admin ones", () => {
    const admin = categoriesForRole(true);
    const staff = categoriesForRole(false);
    expect(admin.length).toBe(NOTIFICATION_CATEGORIES.length);
    expect(staff.every((c) => !c.adminOnly)).toBe(true);
    expect(staff.map((c) => c.key)).toContain("wo_assigned");
    expect(staff.map((c) => c.key)).not.toContain("payment_nsf");
  });

  it("gates admin-only categories and rejects unknown keys", () => {
    expect(canUseCategory("wo_assigned", false)).toBe(true);
    expect(canUseCategory("payment_nsf", false)).toBe(false);
    expect(canUseCategory("payment_nsf", true)).toBe(true);
    expect(canUseCategory("nope", true)).toBe(false);
  });

  it("has a personal, non-admin calendar-tasks category", () => {
    expect(canUseCategory("calendar_tasks", false)).toBe(true);
    expect(NOTIFICATION_CATEGORIES.find((c) => c.key === "calendar_tasks")).toMatchObject({ adminOnly: false, personal: true });
  });
});
