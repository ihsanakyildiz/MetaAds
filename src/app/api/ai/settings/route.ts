import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { getAiStatus, saveAiSettings } from "@/lib/ai";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const saveSchema = z.object({
  provider: z.enum(["GROQ", "GEMINI"]),
  model: z.string().trim().max(120).optional(),
  apiKey: z.string().trim().optional(),
  enabled: z.boolean(),
  closePassword: z.string().optional(),
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json(await getAiStatus());
}

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));

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

  await saveAiSettings({
    provider: parsed.data.provider,
    model: parsed.data.model ?? "",
    apiKey: parsed.data.apiKey,
    enabled: parsed.data.enabled,
    updatedById: auth.user.id,
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "ai.settings.update",
      entity: "ai_settings",
      details: `Sağlayıcı: ${parsed.data.provider}`,
    },
  });

  return NextResponse.json(await getAiStatus());
}
