import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { normalizeOAuthRedirectUri } from "@/lib/oauth-redirect";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const redirectSchema = z.object({
  redirectUri: z.string().trim().min(8, "Geçerli bir adres girin."),
  closePassword: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = redirectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz adres." },
      { status: 400 },
    );
  }

  const denied = await rejectIfInvalidCloseSecret(parsed.data.closePassword);

  if (denied) {
    return denied;
  }

  let redirectUri: string;

  try {
    redirectUri = normalizeOAuthRedirectUri(parsed.data.redirectUri);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Geçerli bir adres girin.",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.metaAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await prisma.metaAppConfig.update({
      where: { id: existing.id },
      data: {
        oauthRedirectUri: redirectUri,
        updatedById: auth.user.id,
      },
    });
  } else {
    await prisma.metaAppConfig.create({
      data: {
        oauthRedirectUri: redirectUri,
        updatedById: auth.user.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "meta.redirect.save",
      entity: "meta_app_config",
      details: redirectUri,
    },
  });

  return NextResponse.json({ ok: true, redirectUri });
}
