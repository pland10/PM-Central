// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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
