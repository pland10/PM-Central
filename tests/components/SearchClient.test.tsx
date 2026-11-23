// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../helpers/fetch";

import { SearchClient } from "@/app/(app)/search/SearchClient";

const TYPE_LABELS = ["Email", "Text", "Call", "Note", "Chat", "Task", "Payment"];

let searchCalls: URLSearchParams[];

beforeEach(() => {
  searchCalls = [];
  // SearchClient fetches relative URLs; resolve them against a dummy origin.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      if (url.pathname === "/api/search") {
        searchCalls.push(url.searchParams);
        return jsonResponse({ rows: [], count: 0 });
      }
      if (url.pathname === "/api/search/suggest" && url.searchParams.get("field") === "contact_names") {
        return jsonResponse({ items: ["Shiv Patel", "Shiv P", "Shivkumar Patel"] });
      }
      return jsonResponse({});
    })
  );
});

const pressed = (label: string) =>
  screen.getByRole("button", { name: label }).getAttribute("aria-pressed");

describe("SearchClient type filter", () => {
  it("selects every type by default", async () => {
    render(<SearchClient />);

    for (const label of TYPE_LABELS) expect(pressed(label)).toBe("true");
    await waitFor(() => expect(searchCalls.length).toBeGreaterThan(0));
    expect(searchCalls[0].get("types")?.split(",")).toHaveLength(TYPE_LABELS.length);
  });

  it("selects only the types named in the link (Search payments →)", async () => {
    render(<SearchClient initialTypes="payment" />);

    expect(pressed("Payment")).toBe("true");
    for (const label of TYPE_LABELS.filter((l) => l !== "Payment")) expect(pressed(label)).toBe("false");
    await waitFor(() => expect(searchCalls.length).toBeGreaterThan(0));
    expect(searchCalls.every((p) => p.get("types") === "payment")).toBe(true);
  });

  it("accepts several types and ignores unknown ones", () => {
    render(<SearchClient initialTypes="email,bogus,text" />);

    expect(pressed("Email")).toBe("true");
    expect(pressed("Text")).toBe("true");
    expect(pressed("Payment")).toBe("false");
  });

  it("falls back to every type when the link names none it knows", () => {
    render(<SearchClient initialTypes="bogus" />);

    for (const label of TYPE_LABELS) expect(pressed(label)).toBe("true");
  });
});

describe("SearchClient freshness", () => {
  it("shows the last-refreshed time from the status endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input, "http://localhost");
        if (url.pathname === "/api/search/status") return jsonResponse({ updatedAt: "2026-11-10T14:05:00Z", stuck: false });
        return jsonResponse({ rows: [], count: 0 });
      })
    );
    render(<SearchClient />);
    expect(await screen.findByText(/Last refreshed Nov 10, 9:05 AM EST/)).toBeTruthy();
  });
});

describe("SearchClient contact scope (several names)", () => {
  it("adds each picked name as a chip and searches them all; × removes one", async () => {
    const user = userEvent.setup();
    render(<SearchClient />);
    const box = screen.getByPlaceholderText("Contact name…");

    await user.type(box, "shiv");
    await user.click(await screen.findByRole("button", { name: "Shiv Patel" }));
    expect(box).toHaveValue(""); // ready for the next name

    await user.type(box, "shiv");
    await user.click(await screen.findByRole("button", { name: "Shivkumar Patel" }));

    const chips = screen.getByRole("list", { name: "Chosen contacts" });
    expect(within(chips).getByText("Shiv Patel")).toBeInTheDocument();
    expect(within(chips).getByText("Shivkumar Patel")).toBeInTheDocument();
    await waitFor(() => expect(searchCalls.at(-1)!.getAll("contact")).toEqual(["Shiv Patel", "Shivkumar Patel"]));

    await user.click(within(chips).getByRole("button", { name: "Remove Shiv Patel" }));
    await waitFor(() => expect(searchCalls.at(-1)!.getAll("contact")).toEqual(["Shivkumar Patel"]));
  });

  it("doesn't add the same name twice", async () => {
    const user = userEvent.setup();
    render(<SearchClient />);
    const box = screen.getByPlaceholderText("Contact name…");
    for (let i = 0; i < 2; i++) {
      await user.type(box, "shiv");
      await user.click(await screen.findByRole("button", { name: "Shiv Patel" }));
    }
    expect(within(screen.getByRole("list", { name: "Chosen contacts" })).getAllByRole("listitem")).toHaveLength(1);
  });
});
