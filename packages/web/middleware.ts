import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/whitelist",
  "/members",
  "/roles",
  "/tickets",
  "/prospects",
  "/api-docs",
  "/settings",
  "/match-manager",
  "/squadjs-config",
  "/discord-bot",
  "/temp-voice",
  "/live-server",
  "/audit-logs",
  "/lobby-monitor",
  "/giveaway",
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
    "/prospects/:path*",
    "/api-docs/:path*",
    "/settings/:path*",
    "/match-manager/:path*",
    "/squadjs-config/:path*",
    "/discord-bot/:path*",
    "/temp-voice/:path*",
    "/live-server/:path*",
    "/audit-logs/:path*",
    "/lobby-monitor/:path*",
    "/giveaway",
    "/giveaway/:path*",
  ],
};
