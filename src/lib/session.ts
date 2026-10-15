import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  signSession,
  type SessionPayload,
  verifySession,
} from "@/lib/session-token";

export { OAUTH_STATE_COOKIE, SESSION_COOKIE, signSession, verifySession };
export type { SessionPayload };

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

function isSecureRequest(request?: Request) {
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  if (!request) {
    return false;
  }

  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }

  return new URL(request.url).protocol === "https:";
}

function sessionCookieOptions(request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function applySessionCookie(
  response: NextResponse,
  token: string,
  request?: Request,
) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return response;
}

export async function setSessionCookie(token: string, request?: Request) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(request));
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
