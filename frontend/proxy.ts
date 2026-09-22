import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";


export function proxy(request: NextRequest) {
  const hasAuthenticationCookie =
    request.cookies.has("sessionid") || request.cookies.has("access");

  if (!hasAuthenticationCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/questions/:path*",
    "/exams/:path*",
    "/profile/:path*",
    "/plans/:path*",
    "/lousa/:path*",
    "/chatIA/:path*",
  ],
};
