import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "metaads_session";
export const OAUTH_STATE_COOKIE = "metaads_oauth_state";

export type SessionPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "ANALYST" | "ADVERTISER";
  name: string;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET tanımlı değil.");
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "ADMIN" &&
        payload.role !== "ANALYST" &&
        payload.role !== "ADVERTISER")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    } satisfies SessionPayload;
  } catch {
    return null;
  }
}
