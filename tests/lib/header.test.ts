import { describe, expect, it } from "vitest";
import { initialsOf, pageTitleFor } from "@/lib/header";

const pages = [
  { href: "/", label: "Dashboard" },
  { href: "/properties", label: "Properties" },
  { href: "/accounting", label: "Accounting" },
  { href: "/admin/data", label: "Data sources" },
  { href: "/admin/preventive", label: "Preventive maintenance" },
];

describe("pageTitleFor", () => {
  it("names the dashboard only on the root path", () => {
    expect(pageTitleFor("/", pages)).toBe("Dashboard");
  });

  it("uses the section a sub-page belongs to", () => {
    expect(pageTitleFor("/properties/abc-123", pages)).toBe("Properties");
    expect(pageTitleFor("/accounting/rentvine", pages)).toBe("Accounting");
    expect(pageTitleFor("/admin/data", pages)).toBe("Data sources");
  });

  it("doesn't match a different section that merely shares a prefix", () => {
    expect(pageTitleFor("/propertiesx", pages)).toBeNull();
  });

  it("returns null for pages that aren't in the menu", () => {
    expect(pageTitleFor("/somewhere-else", pages)).toBeNull();
  });
});

describe("initialsOf", () => {
  it("takes first and last initials", () => {
    expect(initialsOf("Jane Q Public")).toBe("JP");
    expect(initialsOf("jane doe")).toBe("JD");
  });

  it("handles a single name or an email", () => {
    expect(initialsOf("Jane")).toBe("J");
    expect(initialsOf("jane.doe@example.com")).toBe("JD");
  });

  it("falls back to a dot for nothing usable", () => {
    expect(initialsOf("")).toBe("·");
  });
});
