import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// App-wide login gate. Two modes, chosen by AUTH_MODE:
//
//   AUTH_MODE=basic    (default) — HTTP Basic Auth, the original behavior.
//   AUTH_MODE=supabase           — real per-user login via Supabase Auth.
//
// Defaulting to "basic" means switching to Supabase is opt-in: nothing breaks
// until you set AUTH_MODE=supabase (and confirm you can sign in). This is the
// bridge toward retiring Basic Auth once Supabase login is verified.

async function supabaseGate(req: NextRequest): Promise<NextResponse> {
  // Let the login page and Supabase auth callback through unauthenticated.
  const path = req.nextUrl.pathname;
  const isAuthRoute = path === "/login" || path.startsWith("/auth");

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Already signed in but sitting on /login -> send to the app.
  if (user && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = req.nextUrl.searchParams.get("next") || "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

function basicGate(req: NextRequest): NextResponse {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // Not configured -> no gate (local dev).
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    const givenUser = decoded.slice(0, sep);
    const givenPass = decoded.slice(sep + 1);
    if (givenUser === user && givenPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PM-Central", charset="UTF-8"' },
  });
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const mode = (process.env.AUTH_MODE || "basic").toLowerCase();
  if (mode === "supabase") return supabaseGate(req);
  return basicGate(req);
}

// Gate everything except Next's static assets (so the gate doesn't re-fire for
// every CSS/JS/image request).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
