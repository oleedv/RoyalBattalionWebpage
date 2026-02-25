import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/whitelist",
  "/members",
  "/roles",
  "/tickets",
  "/api-docs",
  "/settings",
  "/match-manager",
  "/squadjs-config",
  "/discord-bot",
  "/live-server",
  "/audit-logs",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for next-auth session token cookie
  const token =
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/whitelist/:path*",
    "/members/:path*",
    "/roles/:path*",
    "/tickets/:path*",
    "/api-docs/:path*",
    "/settings/:path*",
    "/match-manager/:path*",
    "/squadjs-config/:path*",
    "/discord-bot/:path*",
    "/live-server/:path*",
    "/audit-logs/:path*",
  ],
};
