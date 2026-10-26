import { vi } from "vitest";

// Minimal stand-in for a fetch Response.
export function jsonResponse(
  body: unknown,
  { status = 200, headers = {} as Record<string, string> } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : status === 401 ? "Unauthorized" : "OK",
    headers: new Headers(headers),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

type Handler = (url: URL, init?: RequestInit) => ReturnType<typeof jsonResponse>;

// Stub global fetch: the first route whose regex matches the URL path answers.
// Unrouted URLs 404, which is what Rentvine does for unknown endpoints.
export function stubFetch(routes: [RegExp, Handler | ReturnType<typeof jsonResponse>][]) {
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    for (const [pattern, answer] of routes) {
      if (pattern.test(url.pathname)) return typeof answer === "function" ? answer(url, init) : answer;
    }
    return jsonResponse({ error: "not found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
