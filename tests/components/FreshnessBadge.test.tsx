// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FreshnessBadge } from "@/components/FreshnessBadge";

const NOW = Date.parse("2026-11-10T15:00:00Z");

describe("FreshnessBadge", () => {
  it("shows when the data was last refreshed, as a real Eastern time plus how long ago", () => {
    render(<FreshnessBadge updatedAt="2026-11-10T14:05:00Z" now={NOW} />);
    expect(screen.getByText(/Last refreshed Nov 10, 9:05 AM EST/)).toBeTruthy();
    expect(screen.getByText(/55m ago/)).toBeTruthy();
  });

  it("shows the stuck message instead when the sync is stuck", () => {
    render(<FreshnessBadge updatedAt="2026-11-10T14:05:00Z" stuck detail="backlog stuck since 9am" now={NOW} />);
    expect(screen.getByText(/backlog stuck since 9am/)).toBeTruthy();
    expect(screen.queryByText(/Last refreshed/)).toBeNull();
  });

  it("renders nothing without a timestamp", () => {
    const { container } = render(<FreshnessBadge now={NOW} />);
    expect(container.textContent).toBe("");
  });
});
