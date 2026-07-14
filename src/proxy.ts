import { NextResponse } from "next/server";

import { auth } from "@/auth";

const publicRoutes = new Set(["/login", "/signup", "/join", "/forgot-password"]);

const protectedPrefixes = [
  "/dashboard",
  "/community",
  "/books",
  "/reading-plan",
  "/meetings",
  "/voting",
  "/announcements",
  "/members",
  "/profile",
  "/application-status",
  "/admin",
];

export default auth((request) => {
  const isLoggedIn = Boolean(request.auth?.user);
  const { pathname } = request.nextUrl;
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (publicRoutes.has(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
