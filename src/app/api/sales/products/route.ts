import { SalesScope } from "@prisma/client";
import { NextResponse } from "next/server";

export const maxDuration = 180;
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { clampSalesWindow } from "@/lib/sales";
import { syncSoldProducts } from "@/lib/sales-products";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  scope: z.enum(["campaign", "adset"]),
  id: z.string().min(1),
  since: z.string().min(1),
  until: z.string().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Satış aralığı seçilmedi." },
      { status: 400 },
    );
  }

  const window = clampSalesWindow(parsed.data.since, parsed.data.until);

  try {
    if (parsed.data.scope === "campaign") {
      const campaign = await prisma.metaCampaign.findUnique({
        where: { id: parsed.data.id },
        select: { metaCampaignId: true },
      });

      if (!campaign) {
        return NextResponse.json(
          { error: "Kampanya bulunamadı." },
          { status: 404 },
        );
      }

      const products = await syncSoldProducts({
        scope: SalesScope.CAMPAIGN,
        parentMetaId: campaign.metaCampaignId,
        objectId: campaign.metaCampaignId,
        level: "campaign",
        catalogCampaignId: campaign.metaCampaignId,
        since: window.since,
        until: window.until,
      });

      return NextResponse.json({ products });
    }

    const adSet = await prisma.metaAdSet.findUnique({
      where: { id: parsed.data.id },
      include: {
        campaign: {
          select: { metaCampaignId: true },
        },
      },
    });

    if (!adSet) {
      return NextResponse.json(
        { error: "Reklam seti bulunamadı." },
        { status: 404 },
      );
    }

    const products = await syncSoldProducts({
      scope: SalesScope.ADSET,
      parentMetaId: adSet.metaAdSetId,
      objectId: adSet.metaAdSetId,
      level: "adset",
      catalogCampaignId: adSet.campaign.metaCampaignId,
      since: window.since,
      until: window.until,
    });

    return NextResponse.json({ products });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ürün satışları yüklenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
