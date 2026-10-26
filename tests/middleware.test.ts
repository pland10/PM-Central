import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

import { config, middleware } from "@/middleware";

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://pmilighthouse.app${path}`, { headers });

const basic = (user: string, pass: string) => ({
  authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
});

const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("middleware — routes that bypass the login gate", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "basic");
    vi.stubEnv("BASIC_AUTH_USER", "admin");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "pw");
  });

  it.each(["/api/cron/sync", "/api/webhooks/tenantturner", "/api/health"])(
    "lets %s through without credentials (it authenticates itself)",
    async (path) => {
      expect(passedThrough(await middleware(req(path)))).toBe(true);
    }
  );

  it("does not treat lookalike paths as public", async () => {
    const res = await middleware(req("/api/healthz"));
    expect(res.status).toBe(401);
  });

  // The matcher decides which paths the gate runs on at all. Browsers fetch the
  // app icons and manifest without a session (installing the app, the login
  // page's tab icon), so those must be outside it — but pages must not be.
  const gated = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

  it.each(["/favicon.ico", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/logo.png"])(
    "serves %s without the login gate",
    (path) => expect(gated(path)).toBe(false)
  );

  it.each(["/", "/search", "/api/payments", "/icons-admin"])("gates %s", (path) => expect(gated(path)).toBe(true));
});

describe("middleware — AUTH_MODE=basic", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "basic");
    vi.stubEnv("BASIC_AUTH_USER", "admin");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "p:w"); // a colon in the password must survive
  });

  it("challenges a request without credentials", async () => {
    const res = await middleware(req("/"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Basic realm="PM-Central"/);
  });

  it("rejects wrong credentials", async () => {
    expect((await middleware(req("/", basic("admin", "nope")))).status).toBe(401);
  });

  it("admits the right credentials", async () => {
    expect(passedThrough(await middleware(req("/", basic("admin", "p:w"))))).toBe(true);
  });

  it("runs open when Basic Auth isn't configured (local dev)", async () => {
    vi.stubEnv("BASIC_AUTH_PASSWORD", "");
    expect(passedThrough(await middleware(req("/")))).toBe(true);
  });

  it("is the default when AUTH_MODE is unset", async () => {
    vi.stubEnv("AUTH_MODE", "");
    expect((await middleware(req("/"))).status).toBe(401);
  });
});

describe("middleware — AUTH_MODE=supabase", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getUser.mockReset();
  });

  it("sends a signed-out visitor to /login, remembering where they were going", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(req("/security-deposits"));

    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/security-deposits");
  });

  it.each(["/login", "/auth/callback"])("lets a signed-out visitor reach %s", async (path) => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(passedThrough(await middleware(req(path)))).toBe(true);
  });

  it("lets a signed-in user through", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    expect(passedThrough(await middleware(req("/")))).toBe(true);
  });

  it("bounces a signed-in user off /login to their destination", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const toNext = await middleware(req("/login?next=/work-orders"));
    const toHome = await middleware(req("/login"));

    expect(new URL(toNext.headers.get("location")!).pathname).toBe("/work-orders");
    expect(new URL(toHome.headers.get("location")!).pathname).toBe("/");
  });
});
