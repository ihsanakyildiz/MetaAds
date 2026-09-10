import { SalesScope } from "@prisma/client";
import {
  evaluateAdSetGuards,
  getBudgetGuardSettings,
  listOpenBudgetAlerts,
} from "@/lib/budget-guard";
import type { AdSetGuardDecision } from "@/lib/budget-guard-types";
import { prisma } from "@/lib/prisma";
import { fromYmd } from "@/lib/date-range";
import { clampSalesWindow, eachYmd } from "@/lib/sales";
import type { SalesDay } from "@/lib/sales-types";
import type {
  ReportAdSetRow,
  ReportCampaignRow,
  ReportDiagnosis,
  ReportKpis,
  ReportPayload,
  ReportProductRow,
} from "@/lib/reports-types";

const WEEKDAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;

type Metric = {
  spend: number;
  purchases: number;
  purchaseValue: number;
  clicks: number;
  impressions: number;
};

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

function emptyMetric(): Metric {
  return {
    spend: 0,
    purchases: 0,
    purchaseValue: 0,
    clicks: 0,
    impressions: 0,
  };
}

function addMetric(left: Metric, right: Metric): Metric {
  return {
    spend: left.spend + right.spend,
    purchases: left.purchases + right.purchases,
    purchaseValue: left.purchaseValue + right.purchaseValue,
    clicks: left.clicks + right.clicks,
    impressions: left.impressions + right.impressions,
  };
}

function ctrOf(metric: Metric) {
  if (metric.impressions <= 0) {
    return 0;
  }

  return round((metric.clicks / metric.impressions) * 100);
}

function diagnose(kpis: ReportKpis): ReportDiagnosis {
  if (kpis.closeCount > 0) {
    return {
      title: `${kpis.closeCount} reklam seti kapatılmalı`,
      summary: `Bu pencerede kapatma önerilen setlerde ${round(kpis.wasteSpend)} harcama var ve satış kalitesi düşük. Parayı kazanan setlere kaydırın; kaybedenleri bekletmeyin.`,
      tone: "danger",
    };
  }

  if (kpis.watchCount > 0) {
    return {
      title: `${kpis.watchCount} set süre istiyor`,
      summary:
        "İlgi var ama satış henüz netleşmedi. Bütçeyi artırmayın; son karar gününe kadar izleyin.",
      tone: "warning",
    };
  }

  if (kpis.scaleCount > 0) {
    return {
      title: `${kpis.scaleCount} kazanan set ölçeklenebilir`,
      summary:
        "Satış ve getiri sağlıklı. Yeni teste para açmak yerine bu setleri besleyin.",
      tone: "success",
    };
  }

  if (kpis.spend === 0 && kpis.purchases === 0) {
    return {
      title: "Rapor için henüz yeterli veri yok",
      summary:
        "Kampanya ve reklam seti sayfalarını bir kez açın; satış ve harcama penceresi dolunca burası portföy karar tahtasına dönüşür.",
      tone: "accent",
    };
  }

  return {
    title: "Portföy sakin, net kayıp yok",
    summary:
      "Kapatılacak set görünmüyor. CTR, ROAS ve satış dağılımını kampanya tablosundan izlemeye devam edin.",
    tone: "accent",
  };
}

function isScale(
  row: ReportAdSetRow,
  minSales: number,
  minRoas: number,
) {
  if (row.status !== "ACTIVE" || row.decision?.action !== "KEEP") {
    return false;
  }

  if (row.purchases < minSales) {
    return false;
  }

  if (row.roas !== null) {
    return row.roas >= minRoas;
  }

  return row.purchases >= minSales + 1 || (row.sellProbability ?? 0) >= 55;
}

export async function buildReports(since: string, until: string): Promise<ReportPayload> {
  const window = clampSalesWindow(since, until);
  const settings = await getBudgetGuardSettings();

  const [campaigns, adSets, dailyRows, scores, productRows, alerts] =
    await Promise.all([
      prisma.metaCampaign.findMany({
        include: {
          account: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.metaAdSet.findMany({
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              accountId: true,
              account: {
                select: { name: true, currency: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.salesDailyStat.findMany({
        where: {
          date: { gte: window.since, lte: window.until },
        },
      }),
      prisma.salesScore.findMany(),
      prisma.salesProductStat.findMany({
        where: { purchases: { gt: 0 } },
        orderBy: { purchases: "desc" },
        take: 80,
      }),
      listOpenBudgetAlerts(),
    ]);

  const dailyByMeta = new Map<string, Metric>();
  const dailyByDate = new Map<string, Metric>();

  for (const row of dailyRows) {
    const metric: Metric = {
      spend: toNumber(row.spend),
      purchases: row.purchases,
      purchaseValue: toNumber(row.purchaseValue),
      clicks: row.clicks,
      impressions: row.impressions,
    };
    const key = `${row.scope}:${row.metaId}`;
    dailyByMeta.set(key, addMetric(dailyByMeta.get(key) ?? emptyMetric(), metric));
    dailyByDate.set(row.date, addMetric(dailyByDate.get(row.date) ?? emptyMetric(), metric));
  }

  const scoreByKey = new Map(
    scores.map((row) => [`${row.scope}:${row.metaId}`, row] as const),
  );

  const currencies = [
    ...new Set(
      campaigns
        .map((campaign) => campaign.account.currency)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const setsByCampaign = new Map<string, typeof adSets>();

  for (const adSet of adSets) {
    const list = setsByCampaign.get(adSet.campaignId) ?? [];
    list.push(adSet);
    setsByCampaign.set(adSet.campaignId, list);
  }

  const decisionByMetaId = new Map<string, AdSetGuardDecision>();

  const campaignsWithSets = campaigns
    .filter((campaign) => (setsByCampaign.get(campaign.id) ?? []).length > 0)
    .sort((left, right) => {
      const leftSpend = toNumber(left.spend);
      const rightSpend = toNumber(right.spend);
      return rightSpend - leftSpend;
    });

  for (const campaign of campaignsWithSets.slice(0, 120)) {
    const children = setsByCampaign.get(campaign.id) ?? [];

    try {
      const evaluated = await evaluateAdSetGuards({
        campaignId: campaign.id,
        campaignMetaId: campaign.metaCampaignId,
        since: window.since,
        until: window.until,
        persist: false,
        adSets: children.map((adSet) => {
          const daily = dailyByMeta.get(`${SalesScope.ADSET}:${adSet.metaAdSetId}`);

          return {
            metaId: adSet.metaAdSetId,
            name: adSet.name,
            effectiveStatus: adSet.effectiveStatus,
            startTime: adSet.startTime,
            spend: String(daily?.spend ?? toNumber(adSet.spend)),
            clicks: String(daily?.clicks ?? toNumber(adSet.clicks)),
            impressions: String(daily?.impressions ?? toNumber(adSet.impressions)),
            ctr: String(
              daily ? ctrOf(daily) : toNumber(adSet.ctr),
            ),
            purchases: daily?.purchases ?? 0,
          };
        }),
      });

      for (const decision of evaluated.decisions) {
        decisionByMetaId.set(decision.metaAdSetId, decision);
      }
    } catch {
      // Stored metrics still power the tables when a campaign cannot be judged.
    }
  }

  const adSetRows: ReportAdSetRow[] = adSets.map((adSet) => {
    const daily = dailyByMeta.get(`${SalesScope.ADSET}:${adSet.metaAdSetId}`);
    const metric = daily ?? {
      spend: toNumber(adSet.spend),
      purchases: 0,
      purchaseValue: 0,
      clicks: toNumber(adSet.clicks),
      impressions: toNumber(adSet.impressions),
    };
    const score = scoreByKey.get(`${SalesScope.ADSET}:${adSet.metaAdSetId}`);
    const decision = decisionByMetaId.get(adSet.metaAdSetId) ?? null;

    return {
      id: adSet.id,
      name: adSet.name,
      metaId: adSet.metaAdSetId,
      campaignId: adSet.campaign.id,
      campaignName: adSet.campaign.name,
      accountId: adSet.campaign.accountId,
      accountName: adSet.campaign.account.name,
      currency: adSet.campaign.account.currency,
      status: adSet.effectiveStatus,
      liveDays: decision?.liveDays ?? null,
      spend: round(metric.spend),
      purchases: metric.purchases,
      purchaseValue: round(metric.purchaseValue),
      clicks: metric.clicks,
      impressions: metric.impressions,
      ctr: daily ? ctrOf(metric) : round(toNumber(adSet.ctr)),
      cpa: ratio(metric.spend, metric.purchases),
      roas: ratio(metric.purchaseValue, metric.spend),
      sellProbability: score?.sellProbability ?? null,
      decision,
    };
  });

  const campaignRows: ReportCampaignRow[] = campaigns.map((campaign) => {
    const children = adSetRows.filter((row) => row.campaignId === campaign.id);
    const daily = dailyByMeta.get(`${SalesScope.CAMPAIGN}:${campaign.metaCampaignId}`);
    const fromChildren = children.reduce(
      (sum, row) =>
        addMetric(sum, {
          spend: row.spend,
          purchases: row.purchases,
          purchaseValue: row.purchaseValue,
          clicks: row.clicks,
          impressions: row.impressions,
        }),
      emptyMetric(),
    );
    const metric = daily && daily.spend + daily.purchases > 0 ? daily : fromChildren;
    const score = scoreByKey.get(`${SalesScope.CAMPAIGN}:${campaign.metaCampaignId}`);

    return {
      id: campaign.id,
      name: campaign.name,
      accountId: campaign.account.id,
      accountName: campaign.account.name,
      currency: campaign.account.currency,
      status: campaign.effectiveStatus,
      spend: round(metric.spend),
      purchases: metric.purchases,
      purchaseValue: round(metric.purchaseValue),
      clicks: metric.clicks,
      impressions: metric.impressions,
      ctr: ctrOf(metric),
      cpa: ratio(metric.spend, metric.purchases),
      roas: ratio(metric.purchaseValue, metric.spend),
      sellProbability: score?.sellProbability ?? null,
      adSetCount: children.length,
      closeCount: children.filter((row) => row.decision?.action === "CLOSE").length,
      watchCount: children.filter((row) => row.decision?.action === "WATCH").length,
    };
  });

  campaignRows.sort((left, right) => right.spend - left.spend || right.purchases - left.purchases);
  adSetRows.sort((left, right) => right.spend - left.spend || right.purchases - left.purchases);

  const close = adSetRows
    .filter((row) => row.decision?.action === "CLOSE" && row.status === "ACTIVE")
    .sort((left, right) => right.spend - left.spend);
  const watch = adSetRows
    .filter((row) => row.decision?.action === "WATCH" && row.status === "ACTIVE")
    .sort((left, right) => right.spend - left.spend);
  const scale = adSetRows
    .filter((row) =>
      isScale(row, settings.minSalesToKeep, settings.minRoasToKeep),
    )
    .sort((left, right) => (right.roas ?? 0) - (left.roas ?? 0) || right.purchases - left.purchases);

  const totals = campaignRows.reduce(
    (sum, row) =>
      addMetric(sum, {
        spend: row.spend,
        purchases: row.purchases,
        purchaseValue: row.purchaseValue,
        clicks: row.clicks,
        impressions: row.impressions,
      }),
    emptyMetric(),
  );

  const kpis: ReportKpis = {
    spend: round(totals.spend),
    purchases: totals.purchases,
    purchaseValue: round(totals.purchaseValue),
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions > 0 ? ctrOf(totals) : null,
    roas: ratio(totals.purchaseValue, totals.spend),
    cpa: ratio(totals.spend, totals.purchases),
    cvr: totals.clicks > 0 ? round((totals.purchases / totals.clicks) * 100) : null,
    activeCampaigns: campaigns.filter((row) => row.effectiveStatus === "ACTIVE").length,
    activeAdSets: adSets.filter((row) => row.effectiveStatus === "ACTIVE").length,
    closeCount: close.length,
    watchCount: watch.length,
    scaleCount: scale.length,
    wasteSpend: round(close.reduce((sum, row) => sum + row.spend, 0)),
  };

  const days: SalesDay[] = eachYmd(window.since, window.until).map((date) => {
    const metric = dailyByDate.get(date) ?? emptyMetric();

    return {
      date,
      weekday: WEEKDAYS[fromYmd(date).getDay()] ?? "",
      purchases: metric.purchases,
      purchaseValue: round(metric.purchaseValue),
      spend: round(metric.spend),
      clicks: metric.clicks,
      impressions: metric.impressions,
    };
  });

  const productsById = new Map<string, ReportProductRow>();

  for (const row of productRows) {
    const current = productsById.get(row.productId);
    const next: ReportProductRow = {
      productId: row.productId,
      name: row.name,
      purchases: row.purchases,
      purchaseValue: toNumber(row.purchaseValue),
      spend: toNumber(row.spend),
      clicks: row.clicks,
      impressions: row.impressions,
    };

    if (!current || next.purchases > current.purchases) {
      productsById.set(row.productId, next);
    }
  }

  const products = [...productsById.values()]
    .sort((left, right) => right.purchases - left.purchases)
    .slice(0, 20);

  return {
    since: window.since,
    until: window.until,
    currency: currencies[0] ?? null,
    mixedCurrency: currencies.length > 1,
    diagnosis: diagnose(kpis),
    kpis,
    days,
    close: close.slice(0, 12),
    watch: watch.slice(0, 8),
    scale: scale.slice(0, 8),
    campaigns: campaignRows,
    adSets: adSetRows,
    products,
    alerts,
  };
}
