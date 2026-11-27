// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveStatus } from "@/app/(app)/accounting/owner-draws/LiveStatus";

const asOf = "2026-11-27T19:05:00.000Z"; // 2:05 PM ET
const base = { ok: true as const, portfolios: [], bills: new Map(), asOf };

afterEach(() => window.history.replaceState(null, "", "/"));

describe("Owner Draws live status", () => {
  it("shows when the figures are from, with a Refresh link that skips the cache", () => {
    render(<LiveStatus live={base} />);
    expect(screen.getByText(/Rentvine figures as of 2:05 PM/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /refresh/i })).toHaveAttribute("href", "/accounting/owner-draws?refresh=1");
  });

  it("flags stale fallback figures and why", () => {
    render(<LiveStatus live={{ ...base, stale: true, staleReason: "Rentvine is busy right now" }} />);
    expect(screen.getByText(/Rentvine is busy right now/)).toBeInTheDocument();
    expect(screen.getByText(/showing the figures from 2:05 PM/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retry/i })).toHaveAttribute("href", "/accounting/owner-draws?refresh=1");
  });

  it("on an error, shows the message and a Retry link", () => {
    render(<LiveStatus live={{ ok: false, status: 429, busy: true, error: "Rentvine is busy right now (too many requests)." }} />);
    expect(screen.getByText(/Couldn't load balances from Rentvine/)).toBeInTheDocument();
    expect(screen.getByText(/too many requests/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retry/i })).toBeInTheDocument();
  });

  it("drops ?refresh=1 from the address bar so the next reload uses the cache", () => {
    window.history.replaceState(null, "", "/accounting/owner-draws?refresh=1");
    render(<LiveStatus live={base} />);
    expect(window.location.search).toBe("");
  });
});
