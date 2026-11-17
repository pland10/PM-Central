// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { NavSection } from "@/components/NavSection";
import { NAV_SECTIONS_COOKIE } from "@/lib/sidebar";

const cookieValue = () =>
  decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith(`${NAV_SECTIONS_COOKIE}=`))?.split("=")[1] ?? "");

describe("NavSection", () => {
  beforeEach(() => {
    document.cookie = `${NAV_SECTIONS_COOKIE}=; path=/; max-age=0`;
  });

  it("folds and unfolds when the heading is clicked, and remembers it", async () => {
    const user = userEvent.setup();
    render(
      <NavSection id="property-data" heading="Property Data" initialOpen>
        <a href="#properties">Properties</a>
      </NavSection>
    );
    const heading = screen.getByRole("button", { name: "Property Data" });
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Properties" })).toBeVisible();

    await user.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("nav-section-items-property-data")).toHaveClass("nav-section-closed");
    expect(cookieValue()).toBe("property-data");

    await user.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-section-items-property-data")).not.toHaveClass("nav-section-closed");
    expect(cookieValue()).toBe("");
  });

  it("keeps other sections' closed state when toggling one", async () => {
    const user = userEvent.setup();
    document.cookie = `${NAV_SECTIONS_COOKIE}=admin; path=/`;
    render(
      <NavSection id="property-data" heading="Property Data" initialOpen>
        <a href="/x">x</a>
      </NavSection>
    );
    await user.click(screen.getByRole("button", { name: "Property Data" }));
    expect(cookieValue().split(",").sort()).toEqual(["admin", "property-data"]);
  });

  it("starts closed when the server says so", () => {
    render(
      <NavSection id="admin" heading="Admin" initialOpen={false}>
        <a href="/x">x</a>
      </NavSection>
    );
    expect(screen.getByRole("button", { name: "Admin" })).toHaveAttribute("aria-expanded", "false");
  });
});
