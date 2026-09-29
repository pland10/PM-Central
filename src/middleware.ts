import { NextRequest, NextResponse } from "next/server";

// App-wide login gate (HTTP Basic Auth).
// - If BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are both set, every request must
//   carry matching credentials or gets a browser login prompt (401).
// - If either is unset, the app runs open — convenient for local dev, but the
//   deploy guide requires both in any public environment.
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // Not configured -> no gate (local dev).
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // atob is available in the Edge runtime middleware runs in.
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

// Gate everything except Next's static assets (so the login prompt doesn't
// re-fire for every CSS/JS/image request once the browser has the credentials).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
