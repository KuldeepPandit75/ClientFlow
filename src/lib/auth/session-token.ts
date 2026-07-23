const DEV_SESSION_SECRET = "clientflow-dev-session-secret";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type AuthTokenType = "access" | "refresh";
export type AuthRoleClaim = "super_admin" | "admin" | "sub_agent";

interface AuthTokenPayload {
  sub: string;
  role?: AuthRoleClaim;
  type: AuthTokenType;
  iat: number;
  exp: number;
}

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }

  return secret || DEV_SESSION_SECRET;
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function createToken(email: string, type: AuthTokenType, ttlSeconds: number, role?: AuthRoleClaim) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: email.trim().toLowerCase(),
    role,
    type,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export async function createAccessToken(email: string, role?: AuthRoleClaim) {
  return createToken(email, "access", ACCESS_TOKEN_TTL_SECONDS, role);
}

export async function createRefreshToken(email: string, role?: AuthRoleClaim) {
  return createToken(email, "refresh", REFRESH_TOKEN_TTL_SECONDS, role);
}

export async function createAuthTokens(email: string, role?: AuthRoleClaim) {
  return {
    accessToken: await createAccessToken(email, role),
    refreshToken: await createRefreshToken(email, role),
  };
}

export async function verifyAuthTokenPayload(token: string | null | undefined, expectedType: AuthTokenType) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = await sign(`${header}.${body}`);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
  } catch {
    return null;
  }

  const email = payload.sub?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (payload.type !== expectedType) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return { email, role: payload.role || null };
}

export async function verifyAuthToken(token: string | null | undefined, expectedType: AuthTokenType) {
  return (await verifyAuthTokenPayload(token, expectedType))?.email || null;
}

export async function getAuthEmailFromTokens(
  accessToken?: string | null,
  refreshToken?: string | null,
) {
  return (
    (await verifyAuthToken(accessToken, "access")) ||
    (await verifyAuthToken(refreshToken, "refresh"))
  );
}

export async function getAuthClaimsFromTokens(
  accessToken?: string | null,
  refreshToken?: string | null,
) {
  return (
    (await verifyAuthTokenPayload(accessToken, "access")) ||
    (await verifyAuthTokenPayload(refreshToken, "refresh"))
  );
}

export const AUTH_TOKEN_MAX_AGES = {
  access: ACCESS_TOKEN_TTL_SECONDS,
  refresh: REFRESH_TOKEN_TTL_SECONDS,
};
