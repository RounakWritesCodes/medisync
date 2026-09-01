import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Server-side auth middleware.
 *
 * Checks the session cookie on every /dashboard/* request. If the cookie is
 * missing or the API rejects it, the user is redirected to /login. This is a
 * fast cookie-only gate — the real session validation still happens via
 * AuthGuard on the client and requireAuth on the API.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("medisync-session")?.value;

  // No session cookie → redirect to login (preserves intended destination)
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate the session against the API
  try {
    const apiRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Cookie: `medisync-session=${sessionCookie}` },
      cache: "no-store",
    });

    if (!apiRes.ok) {
      // Invalid or expired session → redirect to login
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch {
    // API unreachable — let the request through; AuthGuard on the client
    // will handle the error gracefully (shows spinner, then redirects).
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
