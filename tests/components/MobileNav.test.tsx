// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { MobileNav } from "@/app/(app)/MobileNav";

const realLocation = window.location;
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

describe("MobileNav", () => {
  it("has a Refresh button and the version at the bottom of the drawer", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
    const user = userEvent.setup();
    render(<MobileNav sections={[]} isAdmin={false} version="v1.0.0 · 2df4cc3" />);

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    const drawer = screen.getByRole("complementary");
    expect(within(drawer).getByText("v1.0.0 · 2df4cc3")).toBeTruthy();

    await user.click(within(drawer).getByRole("button", { name: /refresh/i }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
