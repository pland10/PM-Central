// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarFooter } from "@/components/SidebarFooter";

const realLocation = window.location;
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

describe("SidebarFooter", () => {
  it("shows the tagline with the version under it", () => {
    render(<SidebarFooter tagline="PM Central" version="v1.0.0 · ddd7f04" />);
    expect(screen.getByText("PM Central")).toBeTruthy();
    expect(screen.getByText("v1.0.0 · ddd7f04")).toBeTruthy();
  });

  it("shows the version large enough to read, in white (not dim grey)", () => {
    render(<SidebarFooter tagline="PM Central" version="v1.0.0 · ddd7f04" />);
    const v = screen.getByText("v1.0.0 · ddd7f04");
    expect(v.className).toMatch(/\btext-sm\b/);
    expect(v.className).toMatch(/\btext-white\b/);
    expect(v.className).not.toMatch(/text-\[11px\]|text-slate-/);
  });

  it("shows the tagline in white too", () => {
    render(<SidebarFooter tagline="PM Central" version="v1.0.0" />);
    const t = screen.getByText("PM Central");
    const cls = `${t.className} ${t.parentElement?.className ?? ""}`;
    expect(cls).toMatch(/\btext-white\b/);
    expect(cls).not.toMatch(/text-slate-/);
  });

  it("has a Refresh button that reloads the page (installed Chrome apps hide reload)", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });

    render(<SidebarFooter tagline="PM Central" version="v1.0.0" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it("shows the PM Central mark next to the product name", () => {
    render(<SidebarFooter tagline="PM Central" version="v1.0.0" />);
    expect(screen.getByRole("img", { name: "PM Central" })).toBeTruthy();
  });
});
