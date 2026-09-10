import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

export const CLOSE_DENIED_MESSAGE =
  "Yetkiniz yok, bu işlemi yapamazsınız.";

const CLOSE_SECRET_HASH =
  process.env.CLOSE_SECRET_HASH ||
  "$2b$12$8VAkvYcM1MaIjo9mw5uG/.cfwsoOHY04JR83ofXFvjoxAoYlIDfey";

export async function isCloseSecretValid(password?: string | null) {
  if (!password) {
    return false;
  }

  const envSecret = process.env.CLOSE_SECRET;

  if (envSecret) {
    return password === envSecret;
  }

  return compare(password, CLOSE_SECRET_HASH);
}

export async function rejectIfInvalidCloseSecret(password?: string | null) {
  const valid = await isCloseSecretValid(password);

  if (valid) {
    return null;
  }

  return NextResponse.json({ error: CLOSE_DENIED_MESSAGE }, { status: 403 });
}

export function isAlreadyPaused(
  status?: string | null,
  effectiveStatus?: string | null,
) {
  return status === "PAUSED" || effectiveStatus === "PAUSED";
}
