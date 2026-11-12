// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PmCentralMark, PoweredByPmCentral } from "@/components/PmCentralMark";

describe("PmCentralMark", () => {
  it("is a labelled image at the requested size", () => {
    render(<PmCentralMark size={32} />);
    const img = screen.getByRole("img", { name: "PM Central" });
    expect(img.getAttribute("width")).toBe("32");
    expect(img.getAttribute("height")).toBe("32");
  });

  it("can be decorative when the name is already written next to it", () => {
    const { container } = render(<PmCentralMark size={18} decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PoweredByPmCentral", () => {
  it("credits the product", () => {
    render(<PoweredByPmCentral />);
    expect(screen.getByText(/powered by/i).textContent).toMatch(/Powered by\s*PM Central/);
  });
});
