import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import {
  AUTH_TOKEN_MAX_AGES,
  type AuthRoleClaim,
  createAuthTokens,
  getAuthEmailFromTokens,
} from "@/lib/auth/session-token";

export { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME };

export async function getSessionEmail() {
  const store = await cookies();
  return getAuthEmailFromTokens(
    store.get(SESSION_COOKIE_NAME)?.value,
    store.get(REFRESH_COOKIE_NAME)?.value,
  );
}

export async function requireSessionEmail() {
  const email = await getSessionEmail();
  if (!email) {
    throw new Error("Authentication required");
  }
  return email;
}

export async function attachSessionCookie(response: NextResponse, email: string, role?: AuthRoleClaim) {
  const tokens = await createAuthTokens(email, role);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  } as const;

  response.cookies.set(SESSION_COOKIE_NAME, tokens.accessToken, {
    ...cookieOptions,
    maxAge: AUTH_TOKEN_MAX_AGES.access,
  });
  response.cookies.set(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...cookieOptions,
    maxAge: AUTH_TOKEN_MAX_AGES.refresh,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  } as const;

  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions);
  response.cookies.set(REFRESH_COOKIE_NAME, "", cookieOptions);
  return response;
}
