import { metaDatePreset } from "@/lib/date-range";
import {
  fetchMetaChildInsights,
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import {
  purchasesByAdSetMetaId,
  syncAdSetSales,
  syncCampaignSales,
} from "@/lib/sales";
import { evaluateAdSetGuards } from "@/lib/budget-guard";
import type {
  AdSetGuardDecision,
  BudgetGuardAlertView,
} from "@/lib/budget-guard-types";
import type {
  ChildFilters,
  ChildListItem,
  ChildStats,
} from "@/lib/children-types";
import type { SalesAnalysis, SalesProduct } from "@/lib/sales-types";

export type { ChildFilters, ChildListItem, ChildStats };

function toNumber(value?: string | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

async function insightMap(
  parentMetaId: string,
  level: "adset" | "ad",
  filters: ChildFilters,
) {
  if (!filters.since || !filters.until) {
    return null;
  }

  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!config || !tokenData) {
    return null;
  }

  const mappedPreset = filters.datePreset
    ? metaDatePreset(filters.datePreset)
    : null;

  try {
    return await fetchMetaChildInsights(
      tokenData.accessToken,
      parentMetaId,
      level,
      mappedPreset
        ? { datePreset: mappedPreset }
        : { since: filters.since, until: filters.until },
      config.graphVersion,
    );
  } catch {
    return null;
  }
}

function applyInsights<
  T extends {
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    ctr: string | null;
  },
>(
  rows: T[],
  getMetaId: (row: T) => string,
  insights: Map<
    string,
    {
      spend: string | null;
      impressions: string | null;
      clicks: string | null;
      ctr: string | null;
    }
  > | null,
) {
  if (!insights) {
    return rows;
  }

  return rows.map((row) => {
    const insight = insights.get(getMetaId(row));
    return {
      ...row,
      spend: insight?.spend ?? "0",
      impressions: insight?.impressions ?? "0",
      clicks: insight?.clicks ?? "0",
      ctr: insight?.ctr ?? "0",
    };
  });
}

function matchesQuery(name: string, metaId: string, query?: string) {
  const value = query?.trim().toLocaleLowerCase("tr");

  if (!value) {
    return true;
  }

  return (
    name.toLocaleLowerCase("tr").includes(value) ||
    metaId.toLocaleLowerCase("tr").includes(value)
  );
}

export function childStats(
  items: Array<{
    effectiveStatus: string | null;
    spend: string | null;
    clicks: string | null;
    impressions: string | null;
    purchases?: number;
  }>,
  analysis?: SalesAnalysis | null,
): ChildStats {
  const spend = items.reduce((sum, item) => sum + toNumber(item.spend), 0);
  const clicks = items.reduce((sum, item) => sum + toNumber(item.clicks), 0);
  const impressions = items.reduce(
    (sum, item) => sum + toNumber(item.impressions),
    0,
  );
  const purchases = analysis
    ? analysis.totalPurchases
    : items.reduce((sum, item) => sum + (item.purchases ?? 0), 0);

  return {
    count: items.length,
    activeCount: items.filter((item) => item.effectiveStatus === "ACTIVE")
      .length,
    spend,
    clicks,
    impressions,
    avgCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
    purchases,
    sellProbability: analysis?.sellProbability ?? null,
    previousProbability: analysis?.previousProbability ?? null,
    probabilityDelta: analysis?.probabilityDelta ?? null,
    salesDays: analysis?.salesDays ?? 0,
    trend: analysis?.trend ?? null,
  };
}

export async function queryAdSets(campaignId: string, filters: ChildFilters) {
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, metaCampaignId: true },
  });

  if (!campaign) {
    throw new Error("Kampanya bulunamadı.");
  }

  const rows = await prisma.metaAdSet.findMany({
    where: {
      campaignId,
      ...(filters.status ? { effectiveStatus: filters.status } : {}),
    },
    orderBy: { name: "asc" },
  });

  const withInsights = applyInsights(
    rows,
    (row) => row.metaAdSetId,
    await insightMap(campaign.metaCampaignId, "adset", filters),
  );

  let analysis: SalesAnalysis | null = null;
  let products: SalesProduct[] = [];
  let purchaseMap = new Map<string, number>();

  if (filters.since && filters.until) {
    const sales = await syncCampaignSales({
      campaignId: campaign.id,
      metaCampaignId: campaign.metaCampaignId,
      adSets: rows.map((row) => ({
        id: row.id,
        metaId: row.metaAdSetId,
        name: row.name,
      })),
      since: filters.since,
      until: filters.until,
    }).catch(() => null);

    analysis = sales?.analysis ?? null;
    products = sales?.products ?? [];
    purchaseMap = await purchasesByAdSetMetaId(
      campaign.metaCampaignId,
      filters.since,
      filters.until,
    );
  }

  const allItems = withInsights.map((row) => ({
    id: row.id,
    name: row.name,
    metaId: row.metaAdSetId,
    effectiveStatus: row.effectiveStatus,
    extra: row.optimizationGoal,
    thumbnailUrl: null,
    dailyBudget: row.dailyBudget,
    lifetimeBudget: row.lifetimeBudget,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
      ctr: row.ctr,
      purchases: purchaseMap.get(row.metaAdSetId) ?? 0,
      startTime: row.startTime?.toISOString() ?? null,
      decision: null,
    })) satisfies ChildListItem[];

  const items = allItems.filter((row) =>
    matchesQuery(row.name, row.metaId, filters.query),
  );

  let alerts: BudgetGuardAlertView[] = [];
  let decisions: AdSetGuardDecision[] = [];

  try {
    const evaluated = await evaluateAdSetGuards({
      campaignId: campaign.id,
      campaignMetaId: campaign.metaCampaignId,
      since: filters.since,
      until: filters.until,
      adSets: allItems,
    });
    alerts = evaluated.alerts;
    decisions = evaluated.decisions;
  } catch {
    alerts = [];
    decisions = [];
  }

  const decisionByMetaId = new Map(
    decisions.map((decision) => [decision.metaAdSetId, decision]),
  );

  return {
    items: items.map((item) => ({
      ...item,
      decision: decisionByMetaId.get(item.metaId) ?? null,
    })),
    analysis,
    products,
    alerts,
  };
}

export async function queryAds(adSetId: string, filters: ChildFilters) {
  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: adSetId },
    select: {
      id: true,
      name: true,
      metaAdSetId: true,
      campaign: {
        select: { metaCampaignId: true },
      },
    },
  });

  if (!adSet) {
    throw new Error("Reklam seti bulunamadı.");
  }

  const rows = await prisma.metaAd.findMany({
    where: {
      adSetId,
      ...(filters.status ? { effectiveStatus: filters.status } : {}),
    },
    orderBy: { name: "asc" },
  });

  const withInsights = applyInsights(
    rows,
    (row) => row.metaAdId,
    await insightMap(adSet.metaAdSetId, "ad", filters),
  );

  let analysis: SalesAnalysis | null = null;
  let products: SalesProduct[] = [];

  if (filters.since && filters.until) {
    const sales = await syncAdSetSales({
      adSetId: adSet.id,
      metaAdSetId: adSet.metaAdSetId,
      parentMetaId: adSet.campaign.metaCampaignId,
      name: adSet.name,
      since: filters.since,
      until: filters.until,
    }).catch(() => null);

    analysis = sales?.analysis ?? null;
    products = sales?.products ?? [];
  }

  const items = withInsights
    .filter((row) => matchesQuery(row.name, row.metaAdId, filters.query))
    .map((row) => ({
      id: row.id,
      name: row.name,
      metaId: row.metaAdId,
      effectiveStatus: row.effectiveStatus,
      extra: row.headline,
      thumbnailUrl: row.thumbnailUrl,
      dailyBudget: null,
      lifetimeBudget: null,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      purchases: 0,
      startTime: null,
      decision: null,
    })) satisfies ChildListItem[];

  return { items, analysis, products };
}
