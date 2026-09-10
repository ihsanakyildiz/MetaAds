import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { encrypt, maskSecret } from "@/lib/crypto";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const configSchema = z.object({
  appId: z.string().trim().min(5, "Geçerli bir App ID girin."),
  appSecret: z.string().trim().min(8, "Geçerli bir App Secret girin."),
  graphVersion: z.string().trim().min(2).optional(),
  closePassword: z.string().optional(),
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response) {
    return auth.response;
  }

  const config = await prisma.metaAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!config) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({
    config: {
      appId: config.appId,
      appSecretMasked: maskSecret(config.appId),
      graphVersion: config.graphVersion,
      updatedAt: config.updatedAt,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const user = auth.user;
  const body = await request.json().catch(() => null);
  const parsed = configSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz form." },
      { status: 400 },
    );
  }

  const denied = await rejectIfInvalidCloseSecret(parsed.data.closePassword);

  if (denied) {
    return denied;
  }

  const existing = await prisma.metaAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    appId: parsed.data.appId,
    appSecret: encrypt(parsed.data.appSecret),
    graphVersion: parsed.data.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v22.0",
    updatedById: user.id,
  };

  const config = existing
    ? await prisma.metaAppConfig.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.metaAppConfig.create({ data });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "meta.config.save",
      entity: "meta_app_config",
      details: config.appId,
    },
  });

  return NextResponse.json({ ok: true });
}
