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
    render(<SidebarFooter tagline="Property Management Hub" version="v1.0.0 · ddd7f04" />);
    expect(screen.getByText("Property Management Hub")).toBeTruthy();
    expect(screen.getByText("v1.0.0 · ddd7f04")).toBeTruthy();
  });

  it("has a Refresh button that reloads the page (installed Chrome apps hide reload)", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });

    render(<SidebarFooter tagline="Property Management Hub" version="v1.0.0" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
