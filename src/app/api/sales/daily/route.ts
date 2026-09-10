import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { emptySalesAnalysis, syncAdSetSales, syncCampaignSales } from "@/lib/sales";

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

  try {
    if (parsed.data.scope === "campaign") {
      const campaign = await prisma.metaCampaign.findUnique({
        where: { id: parsed.data.id },
        include: {
          adSets: {
            select: { id: true, metaAdSetId: true, name: true },
          },
        },
      });

      if (!campaign) {
        return NextResponse.json(
          { error: "Kampanya bulunamadı." },
          { status: 404 },
        );
      }

      const sales = await syncCampaignSales({
        campaignId: campaign.id,
        metaCampaignId: campaign.metaCampaignId,
        adSets: campaign.adSets.map((adSet) => ({
          id: adSet.id,
          metaId: adSet.metaAdSetId,
          name: adSet.name,
        })),
        since: parsed.data.since,
        until: parsed.data.until,
      });

      return NextResponse.json(
        sales ?? {
          days: [],
          analysis: emptySalesAnalysis(),
          sellers: [],
          products: [],
        },
      );
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

    const sales = await syncAdSetSales({
      adSetId: adSet.id,
      metaAdSetId: adSet.metaAdSetId,
      parentMetaId: adSet.campaign.metaCampaignId,
      name: adSet.name,
      since: parsed.data.since,
      until: parsed.data.until,
    });

    return NextResponse.json(
      sales ?? {
        days: [],
        analysis: emptySalesAnalysis(),
        sellers: [],
        products: [],
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Satış verileri yüklenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
