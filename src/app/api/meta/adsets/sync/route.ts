import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { syncCampaignAdSets } from "@/lib/meta";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const syncSchema = z.object({
  campaignId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = syncSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Kampanya seçilmedi." }, { status: 400 });
  }

  try {
    const result = await syncCampaignAdSets(parsed.data.campaignId);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.adsets.sync",
        entity: "meta_ad_set",
        details: `${result.campaignName} (${result.count} reklam seti)`,
      },
    });

    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam setleri alınamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
