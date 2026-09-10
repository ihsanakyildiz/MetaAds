import { SalesScope } from "@prisma/client";
import { listOpenBudgetAlerts } from "@/lib/budget-guard";
import type {
  DashboardAdRow,
  DashboardCreativeRow,
  DashboardKpis,
  DashboardPayload,
  DashboardRankRow,
} from "@/lib/dashboard-types";
import { fromYmd } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { clampSalesWindow, eachYmd } from "@/lib/sales";
import type { SalesDay } from "@/lib/sales-types";

const WEEKDAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return round(numerator / denominator);
}

function ctrOf(clicks: number, impressions: number) {
  if (impressions <= 0) {
    return null;
  }

  return round((clicks / impressions) * 100);
}

export async function buildDashboard(
  since: string,
  until: string,
): Promise<DashboardPayload> {
  const window = clampSalesWindow(since, until);

  const [
    campaignScores,
    adSetScores,
    dailyRows,
    campaigns,
    adSets,
    ads,
    products,
    alerts,
    campaignCount,
    adSetCount,
    adCount,
    activeCampaigns,
  ] = await Promise.all([
    prisma.salesScore.findMany({
      where: { scope: SalesScope.CAMPAIGN },
      orderBy: [{ totalPurchases: "desc" }, { sellProbability: "desc" }],
      take: 24,
    }),
    prisma.salesScore.findMany({
      where: { scope: SalesScope.ADSET },
      orderBy: [{ totalPurchases: "desc" }, { sellProbability: "desc" }],
      take: 24,
    }),
    prisma.salesDailyStat.findMany({
      where: {
        scope: SalesScope.CAMPAIGN,
        date: { gte: window.since, lte: window.until },
      },
    }),
    prisma.metaCampaign.findMany({
      include: {
        account: {
          select: { id: true, name: true, currency: true },
        },
      },
    }),
    prisma.metaAdSet.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            accountId: true,
            account: { select: { name: true, currency: true } },
          },
        },
      },
    }),
    prisma.metaAd.findMany({
      where: { thumbnailUrl: { not: null } },
      include: {
        adSet: {
          select: {
            id: true,
            name: true,
            metaAdSetId: true,
            campaign: {
              select: {
                id: true,
                name: true,
                accountId: true,
                account: { select: { currency: true, name: true } },
              },
            },
          },
        },
      },
      take: 120,
    }),
    prisma.salesProductStat.findMany({
      where: { purchases: { gt: 0 } },
      orderBy: { purchases: "desc" },
      take: 40,
    }),
    listOpenBudgetAlerts().catch(() => []),
    prisma.metaCampaign.count(),
    prisma.metaAdSet.count(),
    prisma.metaAd.count(),
    prisma.metaCampaign.count({ where: { effectiveStatus: "ACTIVE" } }),
  ]);

  const campaignScoreByMeta = new Map(
    campaignScores.map((score) => [score.metaId, score]),
  );
  const adSetScoreByMeta = new Map(adSetScores.map((score) => [score.metaId, score]));

  const dailyByMeta = new Map<
    string,
    { spend: number; purchases: number; purchaseValue: number; clicks: number; impressions: number }
  >();
  const dailyByDate = new Map<
    string,
    { spend: number; purchases: number; purchaseValue: number; clicks: number; impressions: number }
  >();

  for (const row of dailyRows) {
    const metric = {
      spend: toNumber(row.spend),
      purchases: row.purchases,
      purchaseValue: toNumber(row.purchaseValue),
      clicks: row.clicks,
      impressions: row.impressions,
    };
    const currentMeta = dailyByMeta.get(row.metaId);
    dailyByMeta.set(row.metaId, currentMeta
      ? {
          spend: currentMeta.spend + metric.spend,
          purchases: currentMeta.purchases + metric.purchases,
          purchaseValue: currentMeta.purchaseValue + metric.purchaseValue,
          clicks: currentMeta.clicks + metric.clicks,
          impressions: currentMeta.impressions + metric.impressions,
        }
      : metric);
    const currentDate = dailyByDate.get(row.date);
    dailyByDate.set(row.date, currentDate
      ? {
          spend: currentDate.spend + metric.spend,
          purchases: currentDate.purchases + metric.purchases,
          purchaseValue: currentDate.purchaseValue + metric.purchaseValue,
          clicks: currentDate.clicks + metric.clicks,
          impressions: currentDate.impressions + metric.impressions,
        }
      : metric);
  }

  const currencies = [
    ...new Set(
      campaigns
        .map((campaign) => campaign.account.currency)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const campaignRows: DashboardRankRow[] = campaigns
    .map((campaign) => {
      const daily = dailyByMeta.get(campaign.metaCampaignId);
      const score = campaignScoreByMeta.get(campaign.metaCampaignId);
      const spend = daily?.spend ?? toNumber(campaign.spend);
      const purchases = daily?.purchases ?? score?.totalPurchases ?? 0;
      const clicks = daily?.clicks ?? toNumber(campaign.clicks);

      return {
        id: campaign.id,
        name: campaign.name,
        href: `/accounts/${campaign.account.id}/campaigns/${campaign.id}`,
        subtitle: campaign.account.name,
        spend: round(spend),
        purchases,
        clicks,
        ctr: daily
          ? ctrOf(daily.clicks, daily.impressions)
          : campaign.ctr
            ? round(toNumber(campaign.ctr))
            : ctrOf(clicks, toNumber(campaign.impressions)),
        sellProbability: score?.sellProbability ?? null,
        currency: campaign.account.currency,
      };
    })
    .filter((row) => row.purchases > 0 || row.spend > 0)
    .sort(
      (left, right) =>
        right.purchases - left.purchases ||
        (right.sellProbability ?? 0) - (left.sellProbability ?? 0) ||
        right.spend - left.spend,
    );

  const adSetRows: DashboardRankRow[] = adSets
    .map((adSet) => {
      const score = adSetScoreByMeta.get(adSet.metaAdSetId);
      return {
        id: adSet.id,
        name: adSet.name,
        href: `/accounts/${adSet.campaign.accountId}/campaigns/${adSet.campaign.id}/adsets/${adSet.id}`,
        subtitle: adSet.campaign.name,
        spend: round(toNumber(adSet.spend)),
        purchases: score?.totalPurchases ?? 0,
        clicks: toNumber(adSet.clicks),
        ctr: adSet.ctr ? round(toNumber(adSet.ctr)) : ctrOf(toNumber(adSet.clicks), toNumber(adSet.impressions)),
        sellProbability: score?.sellProbability ?? null,
        currency: adSet.campaign.account.currency,
      };
    })
    .filter((row) => row.purchases > 0 || row.spend > 0 || (row.sellProbability ?? 0) > 0)
    .sort(
      (left, right) =>
        right.purchases - left.purchases ||
        (right.sellProbability ?? 0) - (left.sellProbability ?? 0),
    );

  const topAds: DashboardAdRow[] = ads
    .map((ad) => {
      const parent = adSetScoreByMeta.get(ad.adSet.metaAdSetId);
      const spend = toNumber(ad.spend);
      const clicks = toNumber(ad.clicks);
      const impressions = toNumber(ad.impressions);

      return {
        id: ad.id,
        name: ad.headline || ad.name,
        href: `/accounts/${ad.adSet.campaign.accountId}/campaigns/${ad.adSet.campaign.id}/adsets/${ad.adSet.id}`,
        subtitle: ad.adSet.campaign.name,
        spend: round(spend),
        purchases: parent?.totalPurchases ?? 0,
        clicks,
        ctr: ctrOf(clicks, impressions),
        sellProbability: parent?.sellProbability ?? null,
        currency: ad.adSet.campaign.account.currency,
        thumbnailUrl: ad.thumbnailUrl,
      };
    })
    .sort(
      (left, right) =>
        (right.ctr ?? 0) * Math.log10(right.clicks + 10) -
          (left.ctr ?? 0) * Math.log10(left.clicks + 10) ||
        right.spend - left.spend,
    )
    .slice(0, 6);

  const seenCreative = new Set<string>();
  const topCreatives: DashboardCreativeRow[] = [];

  for (const ad of [...ads].sort((left, right) => {
    const leftScore = adSetScoreByMeta.get(left.adSet.metaAdSetId)?.sellProbability ?? 0;
    const rightScore = adSetScoreByMeta.get(right.adSet.metaAdSetId)?.sellProbability ?? 0;
    return rightScore - leftScore;
  })) {
    const key = ad.thumbnailUrl ?? ad.id;
    if (seenCreative.has(key) || !ad.thumbnailUrl) {
      continue;
    }

    seenCreative.add(key);
    const parent = adSetScoreByMeta.get(ad.adSet.metaAdSetId);
    topCreatives.push({
      id: ad.id,
      name: ad.headline || ad.name,
      previewUrl: ad.thumbnailUrl,
      kind: ad.mediaType === "VIDEO" || ad.videoId ? "VIDEO" : "IMAGE",
      sellProbability: parent?.sellProbability ?? 0,
      href: `/creatives`,
    });

    if (topCreatives.length >= 6) {
      break;
    }
  }

  const productMap = new Map<string, { name: string; purchases: number; spend: number }>();
  for (const row of products) {
    const name = row.name || row.productId;
    const current = productMap.get(name);
    const next = {
      name,
      purchases: (current?.purchases ?? 0) + row.purchases,
      spend: (current?.spend ?? 0) + toNumber(row.spend),
    };
    productMap.set(name, next);
  }

  const topProducts = [...productMap.values()]
    .sort((left, right) => right.purchases - left.purchases)
    .slice(0, 6);

  const totals = [...dailyByMeta.values()].reduce(
    (sum, metric) => ({
      spend: sum.spend + metric.spend,
      purchases: sum.purchases + metric.purchases,
      purchaseValue: sum.purchaseValue + metric.purchaseValue,
      clicks: sum.clicks + metric.clicks,
    }),
    { spend: 0, purchases: 0, purchaseValue: 0, clicks: 0 },
  );

  const scored = [...campaignScores, ...adSetScores];
  const avgSellProbability =
    scored.length > 0
      ? round(
          scored.reduce((sum, row) => sum + row.sellProbability, 0) / scored.length,
          1,
        )
      : null;

  const kpis: DashboardKpis = {
    spend: round(totals.spend),
    purchases: totals.purchases,
    purchaseValue: round(totals.purchaseValue),
    clicks: totals.clicks,
    roas: ratio(totals.purchaseValue, totals.spend),
    cpa: ratio(totals.spend, totals.purchases),
    campaignCount,
    adSetCount,
    adCount,
    activeCampaigns,
    avgSellProbability,
  };

  const days: SalesDay[] = eachYmd(window.since, window.until).map((date) => {
    const metric = dailyByDate.get(date);
    return {
      date,
      weekday: WEEKDAYS[fromYmd(date).getDay()] ?? "",
      purchases: metric?.purchases ?? 0,
      purchaseValue: round(metric?.purchaseValue ?? 0),
      spend: round(metric?.spend ?? 0),
      clicks: metric?.clicks ?? 0,
      impressions: metric?.impressions ?? 0,
    };
  });

  const bestCampaign = campaignRows[0];
  const bestSet = adSetRows[0];
  const insight = !bestCampaign && totals.purchases === 0
    ? {
        title: "Performans kartları veri bekliyor",
        detail:
          "Kampanya ve reklam seti sayfalarını bir kez yenileyin; satış ve harcama dolunca en iyiler burada sıralanır.",
        tone: "neutral" as const,
      }
    : bestSet && bestSet.purchases >= (bestCampaign?.purchases ?? 0)
      ? {
          title: `En iyi satış seti “${bestSet.name}”`,
          detail: `${bestSet.purchases} satış · satış olasılığı %${Math.round(bestSet.sellProbability ?? 0)}. Yeni bütçeyi bu sete ve bağlı reklamlarına kaydırın.`,
          tone: "success" as const,
        }
      : {
          title: `Öne çıkan kampanya “${bestCampaign?.name ?? "—"}”`,
          detail: `${bestCampaign?.purchases ?? 0} satış ve ${round(bestCampaign?.spend ?? 0)} harcama ile dönemde lider.`,
          tone: "accent" as const,
        };

  return {
    since: window.since,
    until: window.until,
    currency: currencies[0] ?? null,
    mixedCurrency: currencies.length > 1,
    insight,
    kpis,
    days,
    topCampaigns: campaignRows.slice(0, 6),
    topAdSets: adSetRows.slice(0, 6),
    topAds,
    topCreatives,
    topProducts,
    alerts: alerts.slice(0, 5),
  };
}
