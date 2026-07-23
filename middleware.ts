import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import {
  AUTH_TOKEN_MAX_AGES,
  createAccessToken,
  getAuthClaimsFromTokens,
} from "@/lib/auth/session-token";

const protectedPaths = ["/dashboard", "/inbox", "/customers", "/profile"];
const adminOnlyPaths = ["/settings", "/billing"];
const permissionProtectedPaths = ["/team", "/automation", "/analytics", "/knowledge", "/templates", "/bulk-messaging"];
const superAdminOnlyPaths = ["/super-admin"];

const authPages = ["/login", "/landing"];

const publicApiPaths = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/invite/accept",
  "/api/webhooks/evolution",
];

function isPublicApiPath(pathname: string) {
  return publicApiPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  let claims = await getAuthClaimsFromTokens(accessToken, null);
  let refreshedAccessToken: string | null = null;

  if (!claims) {
    claims = await getAuthClaimsFromTokens(null, refreshToken);
    if (claims) {
      refreshedAccessToken = await createAccessToken(claims.email, claims.role || undefined);
    }
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !isPublicApiPath(pathname) && !claims) {
    const response = NextResponse.json(
      {
        success: false,
        message: "Authentication required",
      },
      { status: 401 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return response;
  }

  const isProtected = [...protectedPaths, ...adminOnlyPaths, ...permissionProtectedPaths, ...superAdminOnlyPaths].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isAuthPage = authPages.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isProtected && !claims) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isAdminOnly = adminOnlyPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isSuperAdminOnly = superAdminOnlyPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (claims && isAdminOnly && claims.role !== "admin") {
    return NextResponse.redirect(new URL(claims.role === "super_admin" ? "/super-admin" : "/inbox", request.url));
  }

  if (claims && isSuperAdminOnly && claims.role !== "super_admin") {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  if (isAuthPage && claims) {
    const response = NextResponse.redirect(new URL(claims.role === "super_admin" ? "/super-admin" : "/inbox", request.url));
    if (refreshedAccessToken) {
      response.cookies.set(SESSION_COOKIE_NAME, refreshedAccessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: AUTH_TOKEN_MAX_AGES.access,
      });
    }
    return response;
  }

  const response = NextResponse.next();
  if (refreshedAccessToken) {
    response.cookies.set(SESSION_COOKIE_NAME, refreshedAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_TOKEN_MAX_AGES.access,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/inbox/:path*",
    "/customers/:path*",
    "/profile/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/automation/:path*",
    "/analytics/:path*",
    "/knowledge/:path*",
    "/templates/:path*",
    "/bulk-messaging/:path*",
    "/super-admin/:path*",
    "/login",
    "/landing",
    "/api/:path*",
  ],
};
