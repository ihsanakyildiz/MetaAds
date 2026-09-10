import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { syncAccountCampaigns } from "@/lib/meta";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const syncSchema = z.object({
  accountId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = syncSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reklam hesabı seçilmedi." },
      { status: 400 },
    );
  }

  try {
    const result = await syncAccountCampaigns(parsed.data.accountId);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.campaigns.sync",
        entity: "meta_campaign",
        details: `${result.accountName} (${result.count} kampanya)`,
      },
    });

    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kampanyalar alınamadı.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
