// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CollapsibleSidebar, SIDEBAR_COOKIE } from "@/components/CollapsibleSidebar";

const clearCookie = () => {
  document.cookie = `${SIDEBAR_COOKIE}=; path=/; max-age=0`;
};

describe("CollapsibleSidebar", () => {
  beforeEach(clearCookie);

  it("starts expanded and collapses to an icon rail, remembering it in a cookie", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSidebar initialCollapsed={false}>
        <a href="/x">Item</a>
      </CollapsibleSidebar>
    );
    const aside = screen.getByRole("complementary");
    expect(aside).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByRole("link", { name: "Item" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=collapsed`);

    await user.click(screen.getByRole("button", { name: "Expand menu" }));
    expect(aside).toHaveAttribute("data-collapsed", "false");
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=expanded`);
  });

  it("honours the saved state from the server (no flash)", () => {
    render(
      <CollapsibleSidebar initialCollapsed>
        <span />
      </CollapsibleSidebar>
    );
    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
