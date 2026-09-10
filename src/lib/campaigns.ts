import type { Prisma } from "@prisma/client";
import {
  metaDatePreset,
  type DateRangePreset,
} from "@/lib/date-range";
import {
  fetchMetaCampaignInsights,
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";

export const CAMPAIGN_PAGE_SIZE = 40;

export type CampaignSort =
  | "spend"
  | "clicks"
  | "ctr"
  | "name"
  | "status";

export type CampaignFilters = {
  accountId?: string;
  query?: string;
  status?: string;
  objective?: string;
  minSpend?: number;
  maxSpend?: number;
  minClicks?: number;
  onlyWithSpend?: boolean;
  sort?: CampaignSort;
  datePreset?: DateRangePreset;
  since?: string;
  until?: string;
};

export type CampaignListItem = {
  id: string;
  name: string;
  metaCampaignId: string;
  effectiveStatus: string | null;
  objective: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  ctr: string | null;
  lastSyncedAt: string | null;
  accountId: string;
  accountName: string;
  currency: string | null;
};

export type CampaignStats = {
  count: number;
  activeCount: number;
  spend: number;
  clicks: number;
  impressions: number;
  avgCtr: number | null;
};

function toNumber(value?: string | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function matchesNumericFilters(
  campaign: {
    spend: string | null;
    clicks: string | null;
  },
  filters: CampaignFilters,
) {
  const spend = toNumber(campaign.spend);
  const clicks = toNumber(campaign.clicks);

  if (filters.onlyWithSpend && spend <= 0) {
    return false;
  }

  if (filters.minSpend !== undefined && spend < filters.minSpend) {
    return false;
  }

  if (filters.maxSpend !== undefined && spend > filters.maxSpend) {
    return false;
  }

  if (filters.minClicks !== undefined && clicks < filters.minClicks) {
    return false;
  }

  return true;
}

function sortCampaigns<
  T extends {
    name: string;
    spend: string | null;
    clicks: string | null;
    ctr: string | null;
    effectiveStatus: string | null;
  },
>(campaigns: T[], sort: CampaignSort) {
  const copy = [...campaigns];

  copy.sort((left, right) => {
    switch (sort) {
      case "spend":
        return toNumber(right.spend) - toNumber(left.spend);
      case "clicks":
        return toNumber(right.clicks) - toNumber(left.clicks);
      case "ctr":
        return toNumber(right.ctr) - toNumber(left.ctr);
      case "name":
        return left.name.localeCompare(right.name, "tr");
      case "status":
        return (left.effectiveStatus ?? "").localeCompare(
          right.effectiveStatus ?? "",
        );
      default: {
        const _exhaustive: never = sort;
        return _exhaustive;
      }
    }
  });

  return copy;
}

export function buildCampaignWhere(
  filters: CampaignFilters,
): Prisma.MetaCampaignWhereInput {
  const query = filters.query?.trim();

  return {
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.status ? { effectiveStatus: filters.status } : {}),
    ...(filters.objective ? { objective: filters.objective } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { metaCampaignId: { contains: query } },
          ],
        }
      : {}),
  };
}

type InsightRow = {
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  ctr: string | null;
};

const insightCache = new Map<
  string,
  { expiresAt: number; values: Map<string, InsightRow> }
>();

function insightCacheKey(
  metaAccountId: string,
  preset: string,
  since: string,
  until: string,
) {
  return `${metaAccountId}:${preset}:${since}:${until}`;
}

async function loadAccountInsights(
  metaAccountId: string,
  filters: CampaignFilters,
) {
  const preset = filters.datePreset ?? "last_30d";
  const since = filters.since ?? "";
  const until = filters.until ?? "";
  const cacheKey = insightCacheKey(metaAccountId, preset, since, until);
  const cached = insightCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.values;
  }

  const [config, tokenData] = await Promise.all([
    getDecryptedMetaConfig(),
    getDecryptedAccessToken(),
  ]);

  if (!config || !tokenData) {
    throw new Error("Meta bağlantısı bulunamadı.");
  }

  const mappedPreset = metaDatePreset(preset);
  const insights = await fetchMetaCampaignInsights(
    tokenData.accessToken,
    metaAccountId,
    mappedPreset
      ? { datePreset: mappedPreset }
      : { since, until },
    config.graphVersion,
  );

  const values = new Map<string, InsightRow>();

  for (const insight of insights) {
    values.set(insight.campaign_id, {
      spend: insight.spend ?? "0",
      impressions: insight.impressions ?? "0",
      clicks: insight.clicks ?? "0",
      ctr: insight.ctr ?? "0",
    });
  }

  insightCache.set(cacheKey, {
    expiresAt: Date.now() + 3 * 60 * 1000,
    values,
  });

  return values;
}

async function applyDateInsights<
  T extends {
    metaCampaignId: string;
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    ctr: string | null;
    account: { metaAccountId: string };
  },
>(rows: T[], filters: CampaignFilters) {
  if (!filters.since || !filters.until) {
    return rows;
  }

  const accountIds = [...new Set(rows.map((row) => row.account.metaAccountId))];
  const maps = await Promise.all(
    accountIds.map(async (metaAccountId) => {
      try {
        return {
          metaAccountId,
          values: await loadAccountInsights(metaAccountId, filters),
          failed: false,
        };
      } catch {
        return {
          metaAccountId,
          values: new Map<string, InsightRow>(),
          failed: true,
        };
      }
    }),
  );
  const byAccount = new Map(
    maps.map((entry) => [entry.metaAccountId, entry]),
  );

  return rows.map((row) => {
    const accountInsights = byAccount.get(row.account.metaAccountId);

    if (!accountInsights || accountInsights.failed) {
      return row;
    }

    const insight = accountInsights.values.get(row.metaCampaignId);

    return {
      ...row,
      spend: insight?.spend ?? "0",
      impressions: insight?.impressions ?? "0",
      clicks: insight?.clicks ?? "0",
      ctr: insight?.ctr ?? "0",
    };
  });
}

export async function queryCampaigns(
  filters: CampaignFilters,
  page = 1,
  limit = CAMPAIGN_PAGE_SIZE,
) {
  const sort = filters.sort ?? "spend";
  const rows = await prisma.metaCampaign.findMany({
    where: buildCampaignWhere(filters),
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
          metaAccountId: true,
        },
      },
    },
  });

  const withInsights = await applyDateInsights(rows, filters);
  const filtered = sortCampaigns(
    withInsights.filter((campaign) => matchesNumericFilters(campaign, filters)),
    sort,
  );

  const spend = filtered.reduce(
    (sum, campaign) => sum + toNumber(campaign.spend),
    0,
  );
  const clicks = filtered.reduce(
    (sum, campaign) => sum + toNumber(campaign.clicks),
    0,
  );
  const impressions = filtered.reduce(
    (sum, campaign) => sum + toNumber(campaign.impressions),
    0,
  );
  const stats: CampaignStats = {
    count: filtered.length,
    activeCount: filtered.filter(
      (campaign) => campaign.effectiveStatus === "ACTIVE",
    ).length,
    spend,
    clicks,
    impressions,
    avgCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
  };

  const start = Math.max(0, (page - 1) * limit);
  const items: CampaignListItem[] = filtered
    .slice(start, start + limit)
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      metaCampaignId: campaign.metaCampaignId,
      effectiveStatus: campaign.effectiveStatus,
      objective: campaign.objective,
      dailyBudget: campaign.dailyBudget,
      lifetimeBudget: campaign.lifetimeBudget,
      spend: campaign.spend,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      ctr: campaign.ctr,
      lastSyncedAt: campaign.lastSyncedAt?.toISOString() ?? null,
      accountId: campaign.account.id,
      accountName: campaign.account.name,
      currency: campaign.account.currency,
    }));

  return {
    items,
    page,
    hasMore: start + items.length < filtered.length,
    stats,
  };
}

export async function getCampaignFacets(accountId?: string) {
  const where = accountId ? { accountId } : {};
  const [statuses, objectives, earliest] = await Promise.all([
    prisma.metaCampaign.groupBy({
      by: ["effectiveStatus"],
      where,
      orderBy: { effectiveStatus: "asc" },
    }),
    prisma.metaCampaign.groupBy({
      by: ["objective"],
      where,
      orderBy: { objective: "asc" },
    }),
    prisma.metaCampaign.findFirst({
      where: {
        ...where,
        startTime: { not: null },
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    }),
  ]);

  return {
    statuses: statuses
      .map((row) => row.effectiveStatus)
      .filter((value): value is string => Boolean(value)),
    objectives: objectives
      .map((row) => row.objective)
      .filter((value): value is string => Boolean(value)),
    maximumSince: earliest?.startTime
      ? earliest.startTime.toISOString().slice(0, 10)
      : undefined,
  };
}
