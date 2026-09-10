import { ConnectionStatus } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import {
  defaultOAuthRedirectUri,
  normalizeOAuthRedirectUri,
} from "@/lib/oauth-redirect";
import { prisma } from "@/lib/prisma";

export { accountStatusLabel, isAccountHealthy } from "@/lib/meta-labels";

const DEFAULT_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v22.0";

export const META_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
] as const;

export type MetaCampaignPayload = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
    }>;
  };
};

export type MetaAdAccountPayload = {
  id: string;
  name: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business_name?: string;
  amount_spent?: string;
};

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

function graphBase(version?: string) {
  return `https://graph.facebook.com/${version ?? DEFAULT_GRAPH_VERSION}`;
}

export function getOAuthRedirectUri() {
  return defaultOAuthRedirectUri();
}

export async function resolveOAuthRedirectUri() {
  const config = await prisma.metaAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { oauthRedirectUri: true },
  });

  if (!config?.oauthRedirectUri) {
    return defaultOAuthRedirectUri();
  }

  try {
    return normalizeOAuthRedirectUri(config.oauthRedirectUri);
  } catch {
    return defaultOAuthRedirectUri();
  }
}

export function buildOAuthUrl(
  appId: string,
  state: string,
  redirectUri: string,
  version?: string,
) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });

  return `https://www.facebook.com/${version ?? DEFAULT_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function graphGet<T>(url: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json()) as T & GraphError;

      if (!response.ok || data.error) {
        throw new Error(
          data.error?.message ?? "Meta Graph API isteği başarısız oldu.",
        );
      }

      return data;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";

      if (!message.includes("fetch failed") || attempt === 2) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Meta Graph API isteği başarısız oldu.");
}

export async function exchangeCodeForToken(
  appId: string,
  appSecret: string,
  code: string,
  redirectUri: string,
  version?: string,
) {
  const shortLived = await graphGet<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(
    `${graphBase(version)}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }).toString()}`,
  );

  const longLived = await graphGet<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(
    `${graphBase(version)}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    }).toString()}`,
  );

  return {
    accessToken: longLived.access_token,
    expiresIn: longLived.expires_in ?? 60 * 60 * 24 * 60,
  };
}

export async function fetchMetaMe(accessToken: string, version?: string) {
  return graphGet<{ id: string; name: string }>(
    `${graphBase(version)}/me?${new URLSearchParams({
      fields: "id,name",
      access_token: accessToken,
    }).toString()}`,
  );
}

export async function fetchMetaAdAccounts(
  accessToken: string,
  version?: string,
) {
  const accounts: MetaAdAccountPayload[] = [];
  let nextUrl: string | null =
    `${graphBase(version)}/me/adaccounts?${new URLSearchParams({
      fields:
        "id,name,account_status,currency,timezone_name,business_name,amount_spent",
      limit: "100",
      access_token: accessToken,
    }).toString()}`;

  type AdAccountsPage = {
    data?: MetaAdAccountPayload[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: AdAccountsPage = await graphGet<AdAccountsPage>(nextUrl);

    accounts.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return accounts;
}

export async function fetchMetaCampaigns(
  accessToken: string,
  metaAccountId: string,
  version?: string,
) {
  const campaigns: MetaCampaignPayload[] = [];
  const params = new URLSearchParams({
    fields:
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(last_30d){spend,impressions,clicks,ctr}",
    limit: "200",
    access_token: accessToken,
  });
  let nextUrl: string | null = `${graphBase(version)}/${metaAccountId}/campaigns?${params.toString()}`;

  type CampaignsPage = {
    data?: MetaCampaignPayload[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: CampaignsPage = await graphGet<CampaignsPage>(nextUrl);
    campaigns.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return campaigns;
}

export type MetaAdSetPayload = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
    }>;
  };
};

export type MetaAdPayload = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    title?: string;
    body?: string;
    name?: string;
    video_id?: string;
    object_type?: string;
  };
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
    }>;
  };
};

export async function fetchMetaAdSets(
  accessToken: string,
  metaCampaignId: string,
  version?: string,
) {
  const adSets: MetaAdSetPayload[] = [];
  const params = new URLSearchParams({
    fields:
      "id,name,status,effective_status,optimization_goal,daily_budget,lifetime_budget,start_time,end_time,insights.date_preset(last_30d){spend,impressions,clicks,ctr}",
    limit: "200",
    access_token: accessToken,
  });
  let nextUrl: string | null = `${graphBase(version)}/${metaCampaignId}/adsets?${params.toString()}`;

  type Page = {
    data?: MetaAdSetPayload[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: Page = await graphGet<Page>(nextUrl);
    adSets.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return adSets;
}

export async function fetchMetaAds(
  accessToken: string,
  metaAdSetId: string,
  version?: string,
) {
  const ads: MetaAdPayload[] = [];
  const params = new URLSearchParams({
    fields:
      "id,name,status,effective_status,creative{thumbnail_url,image_url,title,body,name,video_id,object_type},insights.date_preset(last_30d){spend,impressions,clicks,ctr}",
    limit: "200",
    access_token: accessToken,
  });
  let nextUrl: string | null = `${graphBase(version)}/${metaAdSetId}/ads?${params.toString()}`;

  type Page = {
    data?: MetaAdPayload[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: Page = await graphGet<Page>(nextUrl);
    ads.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return ads;
}

export async function fetchMetaChildInsights(
  accessToken: string,
  parentId: string,
  level: "adset" | "ad",
  range: { datePreset: string } | { since: string; until: string },
  version?: string,
) {
  const idField = level === "adset" ? "adset_id" : "ad_id";
  const params = new URLSearchParams({
    level,
    fields: `${idField},spend,impressions,clicks,ctr`,
    limit: "500",
    access_token: accessToken,
  });

  if ("datePreset" in range) {
    params.set("date_preset", range.datePreset);
  } else {
    params.set(
      "time_range",
      JSON.stringify({ since: range.since, until: range.until }),
    );
  }

  const insights: Array<Record<string, string | undefined>> = [];
  let nextUrl: string | null = `${graphBase(version)}/${parentId}/insights?${params.toString()}`;

  type Page = {
    data?: Array<Record<string, string | undefined>>;
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: Page = await graphGet<Page>(nextUrl);
    insights.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  const values = new Map<
    string,
    {
      spend: string | null;
      impressions: string | null;
      clicks: string | null;
      ctr: string | null;
    }
  >();

  for (const insight of insights) {
    const id = insight[idField];
    if (!id) {
      continue;
    }

    values.set(id, {
      spend: insight.spend ?? "0",
      impressions: insight.impressions ?? "0",
      clicks: insight.clicks ?? "0",
      ctr: insight.ctr ?? "0",
    });
  }

  return values;
}

export type MetaInsightAction = {
  action_type: string;
  value: string;
};

export type MetaDailyInsight = {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
};

export async function fetchMetaDailyInsights(
  accessToken: string,
  objectId: string,
  level: "campaign" | "adset",
  range: { since: string; until: string },
  version?: string,
) {
  const idField = level === "campaign" ? "campaign_id" : "adset_id";
  const params = new URLSearchParams({
    level,
    time_increment: "1",
    fields: `${idField},date_start,spend,impressions,clicks,actions,action_values`,
    limit: "500",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    access_token: accessToken,
  });

  const insights: MetaDailyInsight[] = [];
  let nextUrl: string | null = `${graphBase(version)}/${objectId}/insights?${params.toString()}`;

  type Page = {
    data?: MetaDailyInsight[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: Page = await graphGet<Page>(nextUrl);
    insights.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return insights;
}

export type MetaBreakdownInsight = MetaDailyInsight & {
  product_id?: string;
  country?: string;
  gender?: string;
  age?: string;
};

export async function fetchMetaInsightsBreakdown(
  accessToken: string,
  objectId: string,
  level: "campaign" | "adset",
  range: { since: string; until: string },
  breakdowns: string[],
  version?: string,
) {
  const params = new URLSearchParams({
    level,
    fields: "spend,impressions,clicks,actions,action_values",
    limit: "500",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    breakdowns: breakdowns.join(","),
    access_token: accessToken,
  });

  const insights: MetaBreakdownInsight[] = [];
  let nextUrl: string | null = `${graphBase(version)}/${objectId}/insights?${params.toString()}`;

  type Page = {
    data?: MetaBreakdownInsight[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: Page = await graphGet<Page>(nextUrl);
    insights.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return insights;
}

export function parseInsightProductId(raw: string) {
  const comma = raw.indexOf(",");

  if (comma === -1) {
    const id = raw.trim();
    return { productId: id, retailerId: id, name: null };
  }

  const id = raw.slice(0, comma).trim();
  const name = raw.slice(comma + 1).trim();

  return {
    productId: id || raw.trim(),
    retailerId: id || null,
    name: name || null,
  };
}

export async function fetchMetaPurchasedProducts(
  accessToken: string,
  objectId: string,
  level: "campaign" | "adset",
  range: { since: string; until: string },
  version?: string,
  hasPurchase?: (insight: MetaBreakdownInsight) => boolean,
) {
  const insights = await fetchMetaInsightsBreakdown(
    accessToken,
    objectId,
    level,
    range,
    ["product_id"],
    version,
  );

  return insights.filter((insight) => {
    if (!insight.product_id) {
      return false;
    }

    return hasPurchase ? hasPurchase(insight) : true;
  });
}

export type MetaCatalogProduct = {
  id: string;
  name?: string;
  retailer_id?: string;
  brand?: string;
  image_url?: string;
  url?: string;
  price?: string;
  currency?: string;
};

export async function fetchMetaCampaignCatalogId(
  accessToken: string,
  metaCampaignId: string,
  version?: string,
) {
  const data = await graphGet<{
    product_catalog_id?: string;
    promoted_object?: { product_catalog_id?: string };
  }>(
    `${graphBase(version)}/${metaCampaignId}?fields=product_catalog_id,promoted_object&access_token=${accessToken}`,
  );

  return (
    data.product_catalog_id ?? data.promoted_object?.product_catalog_id ?? null
  );
}

export async function fetchMetaProductsByIds(
  accessToken: string,
  productIds: string[],
  version?: string,
) {
  const unique = [...new Set(productIds.filter(Boolean))].slice(0, 50);

  if (unique.length === 0) {
    return new Map<string, MetaCatalogProduct>();
  }

  const params = new URLSearchParams({
    ids: unique.join(","),
    fields: "id,name,retailer_id,brand,image_url,url,price,currency",
    access_token: accessToken,
  });

  const data = await graphGet<Record<string, MetaCatalogProduct | GraphError>>(
    `${graphBase(version)}/?${params.toString()}`,
  );
  const products = new Map<string, MetaCatalogProduct>();

  for (const id of unique) {
    const item = data[id];

    if (!item || "error" in item || !("id" in item)) {
      continue;
    }

    products.set(id, item);
  }

  return products;
}

export async function fetchMetaCatalogProductsByRetailerIds(
  accessToken: string,
  catalogId: string,
  retailerIds: string[],
  version?: string,
) {
  const unique = [...new Set(retailerIds.filter(Boolean))].slice(0, 50);

  if (unique.length === 0) {
    return new Map<string, MetaCatalogProduct>();
  }

  const filter = JSON.stringify({
    retailer_id: { is_any: unique },
  });
  const params = new URLSearchParams({
    filter,
    fields: "id,name,retailer_id,brand,image_url,url,price,currency",
    limit: "50",
    access_token: accessToken,
  });

  const page = await graphGet<{ data?: MetaCatalogProduct[] }>(
    `${graphBase(version)}/${catalogId}/products?${params.toString()}`,
  );
  const products = new Map<string, MetaCatalogProduct>();

  for (const item of page.data ?? []) {
    if (item.retailer_id) {
      products.set(item.retailer_id, item);
    }

    products.set(item.id, item);
  }

  return products;
}

export type MetaCampaignInsight = {
  campaign_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
};

export async function fetchMetaCampaignInsights(
  accessToken: string,
  metaAccountId: string,
  range: { datePreset: string } | { since: string; until: string },
  version?: string,
) {
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,spend,impressions,clicks,ctr",
    limit: "500",
    access_token: accessToken,
  });

  if ("datePreset" in range) {
    params.set("date_preset", range.datePreset);
  } else {
    params.set(
      "time_range",
      JSON.stringify({ since: range.since, until: range.until }),
    );
  }

  const insights: MetaCampaignInsight[] = [];
  let nextUrl: string | null = `${graphBase(version)}/${metaAccountId}/insights?${params.toString()}`;

  type InsightsPage = {
    data?: MetaCampaignInsight[];
    paging?: { next?: string };
  };

  while (nextUrl) {
    const page: InsightsPage = await graphGet<InsightsPage>(nextUrl);
    insights.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
  }

  return insights;
}

function parseMetaDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function syncAccountCampaigns(accountId: string) {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();
  const account = await prisma.metaAdAccount.findUnique({
    where: { id: accountId },
  });

  if (!config || !tokenData || !account) {
    throw new Error("Meta bağlantısı veya reklam hesabı bulunamadı.");
  }

  const campaigns = await fetchMetaCampaigns(
    tokenData.accessToken,
    account.metaAccountId,
    config.graphVersion,
  );
  const now = new Date();

  await prisma.metaCampaign.deleteMany({
    where: { accountId: account.id },
  });

  if (campaigns.length > 0) {
    await prisma.metaCampaign.createMany({
      data: campaigns.map((campaign) => {
        const insight = campaign.insights?.data?.[0];

        return {
          accountId: account.id,
          metaCampaignId: campaign.id,
          name: campaign.name,
          status: campaign.status ?? null,
          effectiveStatus: campaign.effective_status ?? null,
          objective: campaign.objective ?? null,
          dailyBudget: campaign.daily_budget ?? null,
          lifetimeBudget: campaign.lifetime_budget ?? null,
          spend: insight?.spend ?? null,
          impressions: insight?.impressions ?? null,
          clicks: insight?.clicks ?? null,
          ctr: insight?.ctr ?? null,
          startTime: parseMetaDate(campaign.start_time),
          stopTime: parseMetaDate(campaign.stop_time),
          lastSyncedAt: now,
        };
      }),
    });
  }

  await prisma.metaAdAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: now },
  });

  return { count: campaigns.length, accountName: account.name };
}

export async function syncCampaignAdSets(campaignId: string) {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    include: {
      account: {
        select: { name: true },
      },
    },
  });

  if (!config || !tokenData || !campaign) {
    throw new Error("Meta bağlantısı veya kampanya bulunamadı.");
  }

  const adSets = await fetchMetaAdSets(
    tokenData.accessToken,
    campaign.metaCampaignId,
    config.graphVersion,
  );
  const now = new Date();

  await prisma.metaAdSet.deleteMany({
    where: { campaignId: campaign.id },
  });

  if (adSets.length > 0) {
    await prisma.metaAdSet.createMany({
      data: adSets.map((adSet) => {
        const insight = adSet.insights?.data?.[0];

        return {
          campaignId: campaign.id,
          metaAdSetId: adSet.id,
          name: adSet.name,
          status: adSet.status ?? null,
          effectiveStatus: adSet.effective_status ?? null,
          optimizationGoal: adSet.optimization_goal ?? null,
          dailyBudget: adSet.daily_budget ?? null,
          lifetimeBudget: adSet.lifetime_budget ?? null,
          spend: insight?.spend ?? null,
          impressions: insight?.impressions ?? null,
          clicks: insight?.clicks ?? null,
          ctr: insight?.ctr ?? null,
          startTime: parseMetaDate(adSet.start_time),
          endTime: parseMetaDate(adSet.end_time),
          lastSyncedAt: now,
        };
      }),
    });
  }

  return {
    count: adSets.length,
    campaignName: campaign.name,
    accountName: campaign.account.name,
  };
}

export async function syncAdSetAds(adSetId: string) {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();
  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: adSetId },
    include: {
      campaign: {
        select: { name: true },
      },
    },
  });

  if (!config || !tokenData || !adSet) {
    throw new Error("Meta bağlantısı veya reklam seti bulunamadı.");
  }

  const ads = await fetchMetaAds(
    tokenData.accessToken,
    adSet.metaAdSetId,
    config.graphVersion,
  );
  const now = new Date();

  await prisma.metaAd.deleteMany({
    where: { adSetId: adSet.id },
  });

  if (ads.length > 0) {
    await prisma.metaAd.createMany({
      data: ads.map((ad) => {
        const insight = ad.insights?.data?.[0];

        return {
          adSetId: adSet.id,
          metaAdId: ad.id,
          name: ad.name,
          status: ad.status ?? null,
          effectiveStatus: ad.effective_status ?? null,
          thumbnailUrl:
            ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null,
          headline: ad.creative?.title ?? ad.creative?.name ?? null,
          body: ad.creative?.body ?? null,
          videoId: ad.creative?.video_id ?? null,
          mediaType:
            ad.creative?.video_id ||
            (ad.creative?.object_type ?? "").toUpperCase().includes("VIDEO")
              ? "VIDEO"
              : "IMAGE",
          spend: insight?.spend ?? null,
          impressions: insight?.impressions ?? null,
          clicks: insight?.clicks ?? null,
          ctr: insight?.ctr ?? null,
          lastSyncedAt: now,
        };
      }),
    });
  }

  return {
    count: ads.length,
    adSetName: adSet.name,
    campaignName: adSet.campaign.name,
  };
}

export async function getDecryptedMetaConfig() {
  const config = await prisma.metaAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!config) {
    return null;
  }

  return {
    ...config,
    appSecret: config.appSecret ? decrypt(config.appSecret) : "",
  };
}

export async function getActiveMetaConnection() {
  return prisma.metaConnection.findFirst({
    where: {
      status: {
        in: [ConnectionStatus.CONNECTED, ConnectionStatus.EXPIRED],
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      adAccounts: {
        orderBy: { name: "asc" },
      },
    },
  });
}

export async function getDecryptedAccessToken() {
  const connection = await getActiveMetaConnection();

  if (!connection) {
    return null;
  }

  return {
    connection,
    accessToken: decrypt(connection.accessToken),
  };
}

