import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (renamed from middleware in Next.js 16) runs before every matched
 * request. It checks for a valid session cookie and redirects to /login
 * if missing or invalid.
 */
export function proxy(request: NextRequest) {
  const sessionSecret = process.env.SESSION_SECRET;

  // If no SESSION_SECRET is set, skip auth entirely (dev convenience)
  if (!sessionSecret) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session")?.value;
  const isAuthenticated = sessionCookie === sessionSecret;

  const { pathname } = request.nextUrl;

  // Already on /login — let them through (but redirect to home if already authed)
  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Auth API — always accessible
  if (pathname === "/api/auth") {
    return NextResponse.next();
  }

  // Not authenticated — redirect to login
  if (!isAuthenticated) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and assets:
     * - _next/static (compiled assets)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
