// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPrefs } from "@/app/(app)/notifications/NotificationPrefs";
import { categoriesForRole } from "@/lib/notification-categories";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("NotificationPrefs", () => {
  it("toggles a category on and posts the change", async () => {
    const user = userEvent.setup();
    render(<NotificationPrefs categories={categoriesForRole(false)} initialEnabled={[]} />);
    const sw = screen.getByRole("switch", { name: "Work orders assigned to me" });
    expect(sw).toHaveAttribute("aria-checked", "false");

    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ category: "wo_assigned", enabled: true });
  });

  it("reverts the toggle if the save fails", async () => {
    fetchMock.mockResolvedValue({ ok: false } as never);
    const user = userEvent.setup();
    render(<NotificationPrefs categories={categoriesForRole(false)} initialEnabled={["wo_assigned"]} />);
    const sw = screen.getByRole("switch", { name: "Work orders assigned to me" });
    expect(sw).toHaveAttribute("aria-checked", "true");

    await user.click(sw);
    expect(await screen.findByText(/reverted/i)).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("shows admin-only categories with a badge for admins", () => {
    render(<NotificationPrefs categories={categoriesForRole(true)} initialEnabled={[]} />);
    expect(screen.getByRole("switch", { name: "Returned / NSF payments" })).toBeInTheDocument();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });
});
