import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("accessToken")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  const hasToken = !!accessToken || !!refreshToken;

  // Logic 1: If user is logged in, redirect away from the login page
  if (pathname === "/" && hasToken) {
    return NextResponse.redirect(new URL("/event", request.url));
  }

  // Logic 2: If user is not logged in, redirect to login page for protected paths
  if (pathname.startsWith("/event") && !hasToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/event/:path*"],
};
