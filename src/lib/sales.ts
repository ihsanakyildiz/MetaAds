import { SalesScope, SalesTrend } from "@prisma/client";
import { addDays, fromYmd, toYmd } from "@/lib/date-range";
import {
  fetchMetaDailyInsights,
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
  type MetaDailyInsight,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { extractPurchases, extractPurchaseValue } from "@/lib/sales-actions";
import type {
  SalesAnalysis,
  SalesDay,
  SalesPayload,
  SalesSeller,
} from "@/lib/sales-types";

export { extractPurchases, extractPurchaseValue } from "@/lib/sales-actions";

export type {
  SalesAnalysis,
  SalesDay,
  SalesPayload,
  SalesSeller,
} from "@/lib/sales-types";

const STALE_MS = 10 * 60 * 1000;
const META_WINDOW_DAYS = 90;
const SNAPSHOT_MIN_GAP_MS = 6 * 60 * 60 * 1000;

type DailyRow = {
  date: string;
  purchases: number;
  purchaseValue: number;
  spend: number;
  clicks: number;
  impressions: number;
};

type ChildRef = {
  id: string;
  metaId: string;
  name: string;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function eachYmd(since: string, until: string) {
  const days: string[] = [];
  let cursor = fromYmd(since);
  const end = fromYmd(until);

  while (cursor.getTime() <= end.getTime()) {
    days.push(toYmd(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function clampSalesWindow(since: string, until: string) {
  const start = fromYmd(since);
  const end = fromYmd(until);
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (span <= META_WINDOW_DAYS) {
    return { since, until };
  }

  return {
    since: toYmd(addDays(end, -(META_WINDOW_DAYS - 1))),
    until,
  };
}

function insightToRow(insight: MetaDailyInsight): DailyRow | null {
  if (!insight.date_start) {
    return null;
  }

  return {
    date: insight.date_start,
    purchases: extractPurchases(insight.actions),
    purchaseValue: extractPurchaseValue(insight.action_values),
    spend: toNumber(insight.spend),
    clicks: Math.round(toNumber(insight.clicks)),
    impressions: Math.round(toNumber(insight.impressions)),
  };
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
}

function weekdayLabel(date: string) {
  return WEEKDAYS[fromYmd(date).getDay()] ?? "";
}

function fillDays(since: string, until: string, rows: DailyRow[]): SalesDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  return eachYmd(since, until).map((date) => {
    const row = byDate.get(date);

    return {
      date,
      weekday: weekdayLabel(date),
      purchases: row?.purchases ?? 0,
      purchaseValue: row?.purchaseValue ?? 0,
      spend: row?.spend ?? 0,
      clicks: row?.clicks ?? 0,
      impressions: row?.impressions ?? 0,
    };
  });
}

export function analyzeSalesDays(days: SalesDay[]): Omit<
  SalesAnalysis,
  "previousProbability" | "probabilityDelta" | "lastAnalyzedAt"
> {
  const activeDays = days.filter(
    (day) => day.spend > 0 || day.impressions > 0 || day.clicks > 0,
  );
  const salesDays = days.filter((day) => day.purchases > 0);
  const totalPurchases = days.reduce((sum, day) => sum + day.purchases, 0);
  const totalValue = days.reduce((sum, day) => sum + day.purchaseValue, 0);
  const totalClicks = days.reduce((sum, day) => sum + day.clicks, 0);
  const totalSpend = days.reduce((sum, day) => sum + day.spend, 0);
  const peak = salesDays.reduce<SalesDay | null>((best, day) => {
    if (!best || day.purchases > best.purchases) {
      return day;
    }

    return best;
  }, null);

  const hitRate = salesDays.length / Math.max(activeDays.length, 1);
  const conversionRate = totalPurchases / Math.max(totalClicks, 1);
  const cvrScore = clamp(conversionRate / 0.02, 0, 1);
  const purchaseSeries = activeDays.map((day) => day.purchases);
  const average = mean(purchaseSeries);
  const consistency =
    average <= 0 ? 0 : 1 - clamp(stddev(purchaseSeries) / average, 0, 1);
  const volume = clamp(totalPurchases / 10, 0, 1);
  const lastThree = days.slice(-3);
  const recency = lastThree.some((day) => day.purchases > 0)
    ? 1
    : lastThree.some((day) => day.clicks > 0)
      ? 0.25
      : 0;
  const recent = days.slice(-7).reduce((sum, day) => sum + day.purchases, 0);
  const previous = days
    .slice(-14, -7)
    .reduce((sum, day) => sum + day.purchases, 0);
  const roas = totalSpend > 0 ? totalValue / totalSpend : 0;
  const roasScore = clamp(roas / 2, 0, 1);

  let trend: SalesTrend = SalesTrend.STABLE;
  let trendBoost = 0;

  if (previous === 0 && recent > 0) {
    trend = SalesTrend.UP;
    trendBoost = 0.08;
  } else if (recent > previous * 1.15) {
    trend = SalesTrend.UP;
    trendBoost = 0.1;
  } else if (recent < previous * 0.85 && previous > 0) {
    trend = SalesTrend.DOWN;
    trendBoost = -0.06;
  }

  if (activeDays.length === 0) {
    return {
      sellProbability: 0,
      conversionRate: 0,
      hitRate: 0,
      consistency: 0,
      salesDays: 0,
      activeDays: 0,
      totalPurchases: 0,
      totalValue: 0,
      avgDailyPurchases: 0,
      peakPurchases: 0,
      peakDate: null,
      trend: SalesTrend.STABLE,
    };
  }

  const raw =
    0.32 * hitRate +
    0.2 * cvrScore +
    0.12 * consistency +
    0.16 * volume +
    0.1 * recency +
    0.1 * roasScore +
    trendBoost;

  return {
    sellProbability: round(clamp(raw, 0, 1) * 100, 1),
    conversionRate: round(conversionRate * 100, 2),
    hitRate: round(hitRate * 100, 1),
    consistency: round(consistency * 100, 1),
    salesDays: salesDays.length,
    activeDays: activeDays.length,
    totalPurchases,
    totalValue: round(totalValue, 2),
    avgDailyPurchases: round(
      totalPurchases / Math.max(activeDays.length, 1),
      2,
    ),
    peakPurchases: peak?.purchases ?? 0,
    peakDate: peak?.date ?? null,
    trend,
  };
}

function applySellerLift(
  campaignScore: number,
  sellers: Array<{ purchases: number }>,
) {
  const selling = sellers.filter((seller) => seller.purchases > 0).length;

  if (selling === 0) {
    return campaignScore;
  }

  const diversity = clamp(selling / Math.max(sellers.length, 1), 0, 1);
  return round(clamp(campaignScore + diversity * 4, 0, 100), 1);
}

async function persistDailyRows(
  scope: SalesScope,
  rows: Array<
    DailyRow & {
      metaId: string;
      scopeId?: string | null;
      parentMetaId?: string | null;
    }
  >,
) {
  if (rows.length === 0) {
    return;
  }

  const now = new Date();
  const metaIds = [...new Set(rows.map((row) => row.metaId))];
  const dates = rows.map((row) => row.date);
  const minDate = dates.reduce((min, date) => (date < min ? date : min));
  const maxDate = dates.reduce((max, date) => (date > max ? date : max));

  await prisma.$transaction([
    prisma.salesDailyStat.deleteMany({
      where: {
        scope,
        metaId: { in: metaIds },
        date: { gte: minDate, lte: maxDate },
      },
    }),
    prisma.salesDailyStat.createMany({
      data: rows.map((row) => ({
        scope,
        metaId: row.metaId,
        scopeId: row.scopeId ?? null,
        parentMetaId: row.parentMetaId ?? null,
        date: row.date,
        purchases: row.purchases,
        purchaseValue: row.purchaseValue ? String(row.purchaseValue) : null,
        spend: String(row.spend),
        clicks: row.clicks,
        impressions: row.impressions,
        syncedAt: now,
      })),
    }),
  ]);
}

async function persistScore(
  scope: SalesScope,
  metaId: string,
  scopeId: string | null,
  computed: ReturnType<typeof analyzeSalesDays>,
  window?: { since: string; until: string },
) {
  const now = new Date();
  const existing = await prisma.salesScore.findUnique({
    where: {
      scope_metaId: { scope, metaId },
    },
  });

  const previousProbability = existing?.sellProbability ?? null;
  const probabilityDelta =
    previousProbability === null
      ? null
      : round(computed.sellProbability - previousProbability, 1);

  await prisma.salesScore.upsert({
    where: {
      scope_metaId: { scope, metaId },
    },
    create: {
      scope,
      metaId,
      scopeId,
      sellProbability: computed.sellProbability,
      previousProbability: null,
      probabilityDelta: null,
      conversionRate: computed.conversionRate,
      hitRate: computed.hitRate,
      consistency: computed.consistency,
      salesDays: computed.salesDays,
      activeDays: computed.activeDays,
      totalPurchases: computed.totalPurchases,
      avgDailyPurchases: computed.avgDailyPurchases,
      peakPurchases: computed.peakPurchases,
      peakDate: computed.peakDate,
      trend: computed.trend,
      windowSince: window?.since,
      windowUntil: window?.until,
      lastAnalyzedAt: now,
    },
    update: {
      scopeId,
      sellProbability: computed.sellProbability,
      previousProbability,
      probabilityDelta,
      conversionRate: computed.conversionRate,
      hitRate: computed.hitRate,
      consistency: computed.consistency,
      salesDays: computed.salesDays,
      activeDays: computed.activeDays,
      totalPurchases: computed.totalPurchases,
      avgDailyPurchases: computed.avgDailyPurchases,
      peakPurchases: computed.peakPurchases,
      peakDate: computed.peakDate,
      trend: computed.trend,
      windowSince: window?.since,
      windowUntil: window?.until,
      lastAnalyzedAt: now,
    },
  });

  const latestSnapshot = await prisma.salesScoreSnapshot.findFirst({
    where: { scope, metaId },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, sellProbability: true },
  });

  const shouldSnapshot =
    !latestSnapshot ||
    now.getTime() - latestSnapshot.capturedAt.getTime() >= SNAPSHOT_MIN_GAP_MS ||
    Math.abs(latestSnapshot.sellProbability - computed.sellProbability) >= 1;

  if (shouldSnapshot) {
    await prisma.salesScoreSnapshot.create({
      data: {
        scope,
        metaId,
        sellProbability: computed.sellProbability,
        totalPurchases: computed.totalPurchases,
        conversionRate: computed.conversionRate,
      },
    });
  }

  return {
    previousProbability,
    probabilityDelta,
    lastAnalyzedAt: now.toISOString(),
  };
}

async function readStoredDays(
  scope: SalesScope,
  metaId: string,
  since: string,
  until: string,
) {
  const rows = await prisma.salesDailyStat.findMany({
    where: {
      scope,
      metaId,
      date: { gte: since, lte: until },
    },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    date: row.date,
    purchases: row.purchases,
    purchaseValue: toNumber(row.purchaseValue),
    spend: toNumber(row.spend),
    clicks: row.clicks,
    impressions: row.impressions,
  }));
}

async function isFresh(
  scope: SalesScope,
  metaId: string,
  since: string,
  until: string,
) {
  const score = await prisma.salesScore.findUnique({
    where: { scope_metaId: { scope, metaId } },
    select: {
      lastSyncedAt: true,
      windowSince: true,
      windowUntil: true,
    },
  });

  if (
    !score?.lastSyncedAt ||
    score.windowSince !== since ||
    score.windowUntil !== until
  ) {
    return false;
  }

  return Date.now() - score.lastSyncedAt.getTime() < STALE_MS;
}

async function markWindowSynced(
  scope: SalesScope,
  metaId: string,
  scopeId: string | null,
  window: { since: string; until: string },
) {
  const now = new Date();

  await prisma.salesScore.upsert({
    where: { scope_metaId: { scope, metaId } },
    create: {
      scope,
      metaId,
      scopeId,
      sellProbability: 0,
      conversionRate: 0,
      hitRate: 0,
      consistency: 0,
      salesDays: 0,
      activeDays: 0,
      totalPurchases: 0,
      avgDailyPurchases: 0,
      peakPurchases: 0,
      trend: SalesTrend.STABLE,
      windowSince: window.since,
      windowUntil: window.until,
      lastSyncedAt: now,
      lastAnalyzedAt: now,
    },
    update: {
      scopeId,
      windowSince: window.since,
      windowUntil: window.until,
      lastSyncedAt: now,
    },
  });
}

async function metaCredentials() {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!config || !tokenData) {
    return null;
  }

  return {
    accessToken: tokenData.accessToken,
    graphVersion: config.graphVersion,
  };
}

function toAnalysis(
  days: SalesDay[],
  history: {
    previousProbability: number | null;
    probabilityDelta: number | null;
    lastAnalyzedAt: string;
  },
  lift = 0,
): SalesAnalysis {
  const computed = analyzeSalesDays(days);
  const sellProbability = round(
    clamp(computed.sellProbability + lift, 0, 100),
    1,
  );

  return {
    ...computed,
    sellProbability,
    previousProbability: history.previousProbability,
    probabilityDelta: history.probabilityDelta,
    lastAnalyzedAt: history.lastAnalyzedAt,
  };
}

export async function syncCampaignSales(input: {
  campaignId: string;
  metaCampaignId: string;
  adSets: ChildRef[];
  since: string;
  until: string;
}): Promise<SalesPayload | null> {
  const window = clampSalesWindow(input.since, input.until);
  const credentials = await metaCredentials();
  const adSetByMetaId = new Map(
    input.adSets.map((adSet) => [adSet.metaId, adSet]),
  );

  if (
    credentials &&
    !(await isFresh(
      SalesScope.CAMPAIGN,
      input.metaCampaignId,
      window.since,
      window.until,
    ))
  ) {
    try {
      const [campaignInsights, adSetInsights] = await Promise.all([
        fetchMetaDailyInsights(
          credentials.accessToken,
          input.metaCampaignId,
          "campaign",
          window,
          credentials.graphVersion,
        ),
        fetchMetaDailyInsights(
          credentials.accessToken,
          input.metaCampaignId,
          "adset",
          window,
          credentials.graphVersion,
        ),
      ]);

      await persistDailyRows(
        SalesScope.CAMPAIGN,
        campaignInsights.flatMap((insight) => {
          const row = insightToRow(insight);
          const metaId = insight.campaign_id ?? input.metaCampaignId;

          if (!row) {
            return [];
          }

          return [
            {
              ...row,
              metaId,
              scopeId: input.campaignId,
            },
          ];
        }),
      );

      await persistDailyRows(
        SalesScope.ADSET,
        adSetInsights.flatMap((insight) => {
          const row = insightToRow(insight);
          const metaId = insight.adset_id;

          if (!row || !metaId) {
            return [];
          }

          return [
            {
              ...row,
              metaId,
              scopeId: adSetByMetaId.get(metaId)?.id ?? null,
              parentMetaId: input.metaCampaignId,
            },
          ];
        }),
      );

      await markWindowSynced(
        SalesScope.CAMPAIGN,
        input.metaCampaignId,
        input.campaignId,
        window,
      );
    } catch {
      // Stored history is used when Meta is unreachable.
    }
  }

  const campaignRows = await readStoredDays(
    SalesScope.CAMPAIGN,
    input.metaCampaignId,
    window.since,
    window.until,
  );
  const days = fillDays(window.since, window.until, campaignRows);
  const computed = analyzeSalesDays(days);

  const adSetRows = await prisma.salesDailyStat.findMany({
    where: {
      scope: SalesScope.ADSET,
      parentMetaId: input.metaCampaignId,
      date: { gte: window.since, lte: window.until },
    },
  });
  const rowsByMetaId = new Map<string, DailyRow[]>();

  for (const row of adSetRows) {
    const list = rowsByMetaId.get(row.metaId) ?? [];
    list.push({
      date: row.date,
      purchases: row.purchases,
      purchaseValue: toNumber(row.purchaseValue),
      spend: toNumber(row.spend),
      clicks: row.clicks,
      impressions: row.impressions,
    });
    rowsByMetaId.set(row.metaId, list);
  }

  const sellers: SalesSeller[] = await Promise.all(
    [...rowsByMetaId.entries()].map(async ([metaId, rows]) => {
      const child = adSetByMetaId.get(metaId);
      const childDays = fillDays(window.since, window.until, rows);
      const childComputed = analyzeSalesDays(childDays);

      await persistScore(
        SalesScope.ADSET,
        metaId,
        child?.id ?? null,
        childComputed,
        window,
      );

      return {
        metaId,
        scopeId: child?.id ?? null,
        name: child?.name ?? metaId,
        purchases: rows.reduce((sum, row) => sum + row.purchases, 0),
        sellProbability: childComputed.sellProbability,
      };
    }),
  );

  sellers.sort((left, right) => right.purchases - left.purchases);

  const lifted = {
    ...computed,
    sellProbability: applySellerLift(computed.sellProbability, sellers),
  };
  const history = await persistScore(
    SalesScope.CAMPAIGN,
    input.metaCampaignId,
    input.campaignId,
    lifted,
    window,
  );

  return {
    days,
    analysis: toAnalysis(days, history, lifted.sellProbability - computed.sellProbability),
    sellers,
    products: [],
  };
}

export async function syncAdSetSales(input: {
  adSetId: string;
  metaAdSetId: string;
  parentMetaId: string;
  name: string;
  since: string;
  until: string;
}): Promise<SalesPayload | null> {
  const window = clampSalesWindow(input.since, input.until);
  const credentials = await metaCredentials();

  if (
    credentials &&
    !(await isFresh(
      SalesScope.ADSET,
      input.metaAdSetId,
      window.since,
      window.until,
    ))
  ) {
    try {
      const insights = await fetchMetaDailyInsights(
        credentials.accessToken,
        input.parentMetaId,
        "adset",
        window,
        credentials.graphVersion,
      );

      await persistDailyRows(
        SalesScope.ADSET,
        insights.flatMap((insight) => {
          const row = insightToRow(insight);
          const metaId = insight.adset_id;

          if (!row || !metaId) {
            return [];
          }

          return [
            {
              ...row,
              metaId,
              scopeId: metaId === input.metaAdSetId ? input.adSetId : null,
              parentMetaId: input.parentMetaId,
            },
          ];
        }),
      );

      await markWindowSynced(
        SalesScope.ADSET,
        input.metaAdSetId,
        input.adSetId,
        window,
      );
    } catch {
      // Stored history is used when Meta is unreachable.
    }
  }

  const rows = await readStoredDays(
    SalesScope.ADSET,
    input.metaAdSetId,
    window.since,
    window.until,
  );
  const days = fillDays(window.since, window.until, rows);
  const computed = analyzeSalesDays(days);
  const history = await persistScore(
    SalesScope.ADSET,
    input.metaAdSetId,
    input.adSetId,
    computed,
    window,
  );

  return {
    days,
    analysis: toAnalysis(days, history),
    sellers: [
      {
        metaId: input.metaAdSetId,
        scopeId: input.adSetId,
        name: input.name,
        purchases: computed.totalPurchases,
        sellProbability: computed.sellProbability,
      },
    ],
    products: [],
  };
}

export async function purchasesByAdSetMetaId(
  parentMetaId: string,
  since: string,
  until: string,
) {
  const window = clampSalesWindow(since, until);
  const rows = await prisma.salesDailyStat.groupBy({
    by: ["metaId"],
    where: {
      scope: SalesScope.ADSET,
      parentMetaId,
      date: { gte: window.since, lte: window.until },
    },
    _sum: { purchases: true },
  });

  return new Map(
    rows.map((row) => [row.metaId, row._sum.purchases ?? 0] as const),
  );
}

export function emptySalesAnalysis(): SalesAnalysis {
  return {
    sellProbability: 0,
    previousProbability: null,
    probabilityDelta: null,
    conversionRate: 0,
    hitRate: 0,
    consistency: 0,
    salesDays: 0,
    activeDays: 0,
    totalPurchases: 0,
    totalValue: 0,
    avgDailyPurchases: 0,
    peakPurchases: 0,
    peakDate: null,
    trend: SalesTrend.STABLE,
    lastAnalyzedAt: new Date().toISOString(),
  };
}
