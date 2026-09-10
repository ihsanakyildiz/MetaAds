import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { updateMetaCampaign } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(400).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  budgetType: z.enum(["none", "daily", "lifetime"]).optional(),
  budgetAmount: z.coerce.number().positive().optional(),
  closePassword: z.string().optional(),
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
      { error: "Kampanya güncellemesi geçersiz." },
      { status: 400 },
    );
  }

  const { closePassword, ...update } = parsed.data;
  const denied = await rejectIfInvalidCloseSecret(closePassword);

  if (denied) {
    return denied;
  }

  try {
    const campaign = await updateMetaCampaign(id, update);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.campaign.update",
        entity: "meta_campaign",
        details: `${campaign.name} (${campaign.metaCampaignId})`,
      },
    });

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kampanya güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
