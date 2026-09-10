import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { updateMetaAdSet } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(400).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  budgetType: z.enum(["none", "daily", "lifetime"]).optional(),
  budgetAmount: z.coerce.number().positive().optional(),
  closePassword: z.string().optional(),
  optimizationGoal: z.string().optional(),
  countries: z.array(z.string().length(2)).optional(),
  ageMin: z.coerce.number().int().min(13).max(65).optional(),
  ageMax: z.coerce.number().int().min(13).max(65).optional(),
  startTime: z.string().optional(),
  pixelId: z.string().optional(),
  customEventType: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reklam seti güncellemesi geçersiz." },
      { status: 400 },
    );
  }

  if (
    parsed.data.ageMin !== undefined &&
    parsed.data.ageMax !== undefined &&
    parsed.data.ageMin > parsed.data.ageMax
  ) {
    return NextResponse.json(
      { error: "Minimum yaş, maksimum yaştan büyük olamaz." },
      { status: 400 },
    );
  }

  const { closePassword, ...update } = parsed.data;
  const denied = await rejectIfInvalidCloseSecret(closePassword);

  if (denied) {
    return denied;
  }

  try {
    const adSet = await updateMetaAdSet(id, update);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.adset.update",
        entity: "meta_ad_set",
        details: `${adSet.name} (${adSet.metaAdSetId})`,
      },
    });

    return NextResponse.json({ ok: true, adSet });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam seti güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
