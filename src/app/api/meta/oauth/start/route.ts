import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import {
  buildOAuthUrl,
  getDecryptedMetaConfig,
  resolveOAuthRedirectUri,
} from "@/lib/meta";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requirePermission(PERMISSIONS.SETTINGS_META);
  const config = await getDecryptedMetaConfig();

  if (!config?.appId || !config.appSecret) {
    return NextResponse.redirect(
      new URL("/settings?error=config", process.env.APP_URL),
    );
  }

  const redirectUri = await resolveOAuthRedirectUri();
  const state = randomBytes(24).toString("hex");

  await prisma.metaOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  await prisma.metaOAuthState.create({
    data: {
      state,
      userId: user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  return NextResponse.redirect(
    buildOAuthUrl(config.appId, state, redirectUri, config.graphVersion),
  );
}
