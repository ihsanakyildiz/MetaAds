import {
  type BudgetType,
  defaultOptimizationGoal,
  needsConversionPixel,
  toMetaMinorUnits,
} from "@/lib/meta-ads-options";
import {
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";

const DEFAULT_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v22.0";

type GraphError = {
  error?: {
    message?: string;
  };
};

export type CampaignWriteInput = {
  accountId: string;
  name: string;
  objective: string;
  status: "ACTIVE" | "PAUSED";
  specialAdCategory: string;
  budgetType: BudgetType;
  budgetAmount?: number;
};

export type CampaignUpdateInput = {
  name?: string;
  status?: "ACTIVE" | "PAUSED";
  budgetType?: BudgetType;
  budgetAmount?: number;
};

export type AdSetWriteInput = {
  campaignId: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  budgetType: BudgetType;
  budgetAmount?: number;
  optimizationGoal?: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  startTime?: string;
  pixelId?: string;
  customEventType?: string;
};

export type AdSetUpdateInput = {
  name?: string;
  status?: "ACTIVE" | "PAUSED";
  budgetType?: BudgetType;
  budgetAmount?: number;
  optimizationGoal?: string;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  startTime?: string;
  pixelId?: string;
  customEventType?: string;
};

export type AdCreativeInput = {
  pageId: string;
  message: string;
  headline?: string;
  description?: string;
  link: string;
  imageUrl?: string;
  cta: string;
};

export type AdWriteInput = {
  adSetId: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  creative: AdCreativeInput;
};

export type AdUpdateInput = {
  name?: string;
  status?: "ACTIVE" | "PAUSED";
  creative?: AdCreativeInput;
};

export type MetaAssetAccount = {
  id: string;
  name: string;
  metaAccountId: string;
  currency: string | null;
};

export type MetaNamedAsset = {
  id: string;
  name: string;
};

async function getGraphContext() {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!config || !tokenData) {
    throw new Error("Meta bağlantısı bulunamadı.");
  }

  return {
    token: tokenData.accessToken,
    version: config.graphVersion || DEFAULT_GRAPH_VERSION,
  };
}

function graphUrl(version: string, path: string, query?: Record<string, string>) {
  const params = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, "")}${params}`;
}

async function graphGet<T>(path: string, query: Record<string, string> = {}) {
  const { token, version } = await getGraphContext();
  const response = await fetch(
    graphUrl(version, path, { ...query, access_token: token }),
    { cache: "no-store" },
  );
  const data = (await response.json()) as T & GraphError;

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Meta isteği başarısız.");
  }

  return data;
}

async function graphPost<T>(path: string, params: Record<string, string>) {
  const { token, version } = await getGraphContext();
  const response = await fetch(graphUrl(version, path), {
    method: "POST",
    body: new URLSearchParams({ ...params, access_token: token }),
    cache: "no-store",
  });
  const data = (await response.json()) as T & GraphError;

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Meta isteği başarısız.");
  }

  return data;
}

function applyBudget(
  params: Record<string, string>,
  budgetType: BudgetType | undefined,
  budgetAmount: number | undefined,
  currency?: string | null,
  clearOther = false,
) {
  if (!budgetType || budgetType === "none" || !budgetAmount || budgetAmount <= 0) {
    return;
  }

  const minor = toMetaMinorUnits(budgetAmount, currency);

  if (budgetType === "daily") {
    params.daily_budget = minor;
    if (clearOther) {
      params.lifetime_budget = "0";
    }
    return;
  }

  params.lifetime_budget = minor;
  if (clearOther) {
    params.daily_budget = "0";
  }
}

function budgetFields(
  budgetType: BudgetType | undefined,
  budgetAmount: number | undefined,
  currency?: string | null,
) {
  if (!budgetType || budgetType === "none" || !budgetAmount || budgetAmount <= 0) {
    return { dailyBudget: null as string | null, lifetimeBudget: null as string | null };
  }

  const minor = toMetaMinorUnits(budgetAmount, currency);

  return budgetType === "daily"
    ? { dailyBudget: minor, lifetimeBudget: null as string | null }
    : { dailyBudget: null as string | null, lifetimeBudget: minor };
}

function targetingPayload(input: {
  countries: string[];
  ageMin: number;
  ageMax: number;
}) {
  return {
    geo_locations: {
      countries: input.countries.length > 0 ? input.countries : ["TR"],
    },
    age_min: input.ageMin,
    age_max: input.ageMax,
  };
}

function creativePayload(input: AdCreativeInput) {
  const linkData: Record<string, unknown> = {
    link: input.link,
    message: input.message,
    call_to_action: {
      type: input.cta,
      value: { link: input.link },
    },
  };

  if (input.headline?.trim()) {
    linkData.name = input.headline.trim();
  }
  if (input.description?.trim()) {
    linkData.description = input.description.trim();
  }
  if (input.imageUrl?.trim()) {
    linkData.picture = input.imageUrl.trim();
  }

  return {
    object_story_spec: {
      page_id: input.pageId,
      link_data: linkData,
    },
  };
}

export async function listWritableAccounts(): Promise<MetaAssetAccount[]> {
  return prisma.metaAdAccount.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      metaAccountId: true,
      currency: true,
    },
  });
}

async function listNamedAssets(path: string) {
  const data = await graphGet<{ data?: MetaNamedAsset[] }>(path, {
    fields: "id,name",
    limit: "100",
  });

  return (data.data ?? []).filter((item) => item.id && item.name);
}

export async function listAccountAssets(accountId: string) {
  const account = await prisma.metaAdAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      metaAccountId: true,
      currency: true,
    },
  });

  if (!account) {
    throw new Error("Reklam hesabı bulunamadı.");
  }

  let pages: MetaNamedAsset[] = [];
  let pixels: MetaNamedAsset[] = [];

  try {
    pages = await listNamedAssets(`${account.metaAccountId}/assigned_pages`);
  } catch {
    pages = [];
  }

  if (pages.length === 0) {
    try {
      pages = await listNamedAssets("me/accounts");
    } catch {
      pages = [];
    }
  }

  try {
    pixels = await listNamedAssets(`${account.metaAccountId}/adspixels`);
  } catch {
    pixels = [];
  }

  return { account, pages, pixels };
}

export async function createMetaCampaign(input: CampaignWriteInput) {
  const account = await prisma.metaAdAccount.findUnique({
    where: { id: input.accountId },
  });

  if (!account) {
    throw new Error("Reklam hesabı bulunamadı.");
  }

  const params: Record<string, string> = {
    name: input.name.trim(),
    objective: input.objective,
    status: input.status,
    special_ad_categories: JSON.stringify(
      input.specialAdCategory === "NONE" || !input.specialAdCategory
        ? []
        : [input.specialAdCategory],
    ),
  };

  if (input.specialAdCategory && input.specialAdCategory !== "NONE") {
    params.special_ad_category_country = JSON.stringify(["TR"]);
  }

  applyBudget(params, input.budgetType, input.budgetAmount, account.currency);

  const created = await graphPost<{ id: string }>(
    `${account.metaAccountId}/campaigns`,
    params,
  );
  const budgets = budgetFields(input.budgetType, input.budgetAmount, account.currency);

  return prisma.metaCampaign.create({
    data: {
      accountId: account.id,
      metaCampaignId: created.id,
      name: input.name.trim(),
      status: input.status,
      effectiveStatus: input.status,
      objective: input.objective,
      dailyBudget: budgets.dailyBudget,
      lifetimeBudget: budgets.lifetimeBudget,
      lastSyncedAt: new Date(),
    },
  });
}

export async function updateMetaCampaign(
  campaignId: string,
  input: CampaignUpdateInput,
) {
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    include: {
      account: {
        select: { currency: true },
      },
    },
  });

  if (!campaign) {
    throw new Error("Kampanya bulunamadı.");
  }

  const params: Record<string, string> = {};

  if (input.name?.trim()) {
    params.name = input.name.trim();
  }
  if (input.status) {
    params.status = input.status;
  }

  applyBudget(
    params,
    input.budgetType,
    input.budgetAmount,
    campaign.account.currency,
    true,
  );

  if (Object.keys(params).length === 0) {
    throw new Error("Güncellenecek alan yok.");
  }

  await graphPost<{ success?: boolean }>(campaign.metaCampaignId, params);

  const budgets = budgetFields(
    input.budgetType,
    input.budgetAmount,
    campaign.account.currency,
  );

  return prisma.metaCampaign.update({
    where: { id: campaign.id },
    data: {
      name: input.name?.trim() || campaign.name,
      status: input.status ?? campaign.status,
      effectiveStatus: input.status ?? campaign.effectiveStatus,
      dailyBudget:
        input.budgetType && input.budgetType !== "none"
          ? budgets.dailyBudget
          : campaign.dailyBudget,
      lifetimeBudget:
        input.budgetType && input.budgetType !== "none"
          ? budgets.lifetimeBudget
          : campaign.lifetimeBudget,
      lastSyncedAt: new Date(),
    },
  });
}

export async function createMetaAdSet(input: AdSetWriteInput) {
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: input.campaignId },
    include: {
      account: true,
    },
  });

  if (!campaign) {
    throw new Error("Kampanya bulunamadı.");
  }

  const campaignHasBudget = Boolean(campaign.dailyBudget || campaign.lifetimeBudget);
  const optimizationGoal =
    input.optimizationGoal || defaultOptimizationGoal(campaign.objective);
  const countries = input.countries.length > 0 ? input.countries : ["TR"];
  const params: Record<string, string> = {
    name: input.name.trim(),
    campaign_id: campaign.metaCampaignId,
    status: input.status,
    billing_event: "IMPRESSIONS",
    optimization_goal: optimizationGoal,
    targeting: JSON.stringify(
      targetingPayload({
        countries,
        ageMin: input.ageMin,
        ageMax: input.ageMax,
      }),
    ),
  };

  if (!campaignHasBudget) {
    applyBudget(params, input.budgetType, input.budgetAmount, campaign.account.currency);

    if (!params.daily_budget && !params.lifetime_budget) {
      throw new Error("Kampanyada bütçe yoksa reklam setine günlük veya toplam bütçe girin.");
    }
  }

  if (input.startTime) {
    params.start_time = new Date(input.startTime).toISOString();
  }

  if (needsConversionPixel(campaign.objective) && input.pixelId) {
    params.destination_type = "WEBSITE";
    params.promoted_object = JSON.stringify({
      pixel_id: input.pixelId,
      custom_event_type: input.customEventType || "PURCHASE",
    });
  }

  const created = await graphPost<{ id: string }>(
    `${campaign.account.metaAccountId}/adsets`,
    params,
  );
  const budgets = campaignHasBudget
    ? { dailyBudget: null, lifetimeBudget: null }
    : budgetFields(input.budgetType, input.budgetAmount, campaign.account.currency);

  return prisma.metaAdSet.create({
    data: {
      campaignId: campaign.id,
      metaAdSetId: created.id,
      name: input.name.trim(),
      status: input.status,
      effectiveStatus: input.status,
      optimizationGoal,
      dailyBudget: budgets.dailyBudget,
      lifetimeBudget: budgets.lifetimeBudget,
      startTime: input.startTime ? new Date(input.startTime) : null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function updateMetaAdSet(adSetId: string, input: AdSetUpdateInput) {
  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: adSetId },
    include: {
      campaign: {
        include: {
          account: {
            select: { currency: true },
          },
        },
      },
    },
  });

  if (!adSet) {
    throw new Error("Reklam seti bulunamadı.");
  }

  const params: Record<string, string> = {};

  if (input.name?.trim()) {
    params.name = input.name.trim();
  }
  if (input.status) {
    params.status = input.status;
  }
  if (input.optimizationGoal) {
    params.optimization_goal = input.optimizationGoal;
  }
  if (input.startTime) {
    params.start_time = new Date(input.startTime).toISOString();
  }

  applyBudget(
    params,
    input.budgetType,
    input.budgetAmount,
    adSet.campaign.account.currency,
    true,
  );

  if (input.countries && input.countries.length > 0) {
    params.targeting = JSON.stringify(
      targetingPayload({
        countries: input.countries,
        ageMin: input.ageMin ?? 18,
        ageMax: input.ageMax ?? 65,
      }),
    );
  }

  if (input.pixelId) {
    params.destination_type = "WEBSITE";
    params.promoted_object = JSON.stringify({
      pixel_id: input.pixelId,
      custom_event_type: input.customEventType || "PURCHASE",
    });
  }

  if (Object.keys(params).length === 0) {
    throw new Error("Güncellenecek alan yok.");
  }

  await graphPost<{ success?: boolean }>(adSet.metaAdSetId, params);

  const budgets = budgetFields(
    input.budgetType,
    input.budgetAmount,
    adSet.campaign.account.currency,
  );

  return prisma.metaAdSet.update({
    where: { id: adSet.id },
    data: {
      name: input.name?.trim() || adSet.name,
      status: input.status ?? adSet.status,
      effectiveStatus: input.status ?? adSet.effectiveStatus,
      optimizationGoal: input.optimizationGoal ?? adSet.optimizationGoal,
      dailyBudget:
        input.budgetType && input.budgetType !== "none"
          ? budgets.dailyBudget
          : adSet.dailyBudget,
      lifetimeBudget:
        input.budgetType && input.budgetType !== "none"
          ? budgets.lifetimeBudget
          : adSet.lifetimeBudget,
      startTime: input.startTime ? new Date(input.startTime) : adSet.startTime,
      lastSyncedAt: new Date(),
    },
  });
}

export async function createMetaAd(input: AdWriteInput) {
  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: input.adSetId },
    include: {
      campaign: {
        include: {
          account: {
            select: { metaAccountId: true },
          },
        },
      },
    },
  });

  if (!adSet) {
    throw new Error("Reklam seti bulunamadı.");
  }

  const created = await graphPost<{ id: string }>(
    `${adSet.campaign.account.metaAccountId}/ads`,
    {
      name: input.name.trim(),
      adset_id: adSet.metaAdSetId,
      status: input.status,
      creative: JSON.stringify(creativePayload(input.creative)),
    },
  );

  return prisma.metaAd.create({
    data: {
      adSetId: adSet.id,
      metaAdId: created.id,
      name: input.name.trim(),
      status: input.status,
      effectiveStatus: input.status,
      headline: input.creative.headline?.trim() || null,
      body: input.creative.message.trim(),
      thumbnailUrl: input.creative.imageUrl?.trim() || null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function updateMetaAd(adId: string, input: AdUpdateInput) {
  const ad = await prisma.metaAd.findUnique({
    where: { id: adId },
  });

  if (!ad) {
    throw new Error("Reklam bulunamadı.");
  }

  const params: Record<string, string> = {};

  if (input.name?.trim()) {
    params.name = input.name.trim();
  }
  if (input.status) {
    params.status = input.status;
  }
  if (input.creative) {
    params.creative = JSON.stringify(creativePayload(input.creative));
  }

  if (Object.keys(params).length === 0) {
    throw new Error("Güncellenecek alan yok.");
  }

  await graphPost<{ success?: boolean }>(ad.metaAdId, params);

  return prisma.metaAd.update({
    where: { id: ad.id },
    data: {
      name: input.name?.trim() || ad.name,
      status: input.status ?? ad.status,
      effectiveStatus: input.status ?? ad.effectiveStatus,
      headline: input.creative?.headline?.trim() || ad.headline,
      body: input.creative?.message.trim() || ad.body,
      thumbnailUrl: input.creative?.imageUrl?.trim() || ad.thumbnailUrl,
      lastSyncedAt: new Date(),
    },
  });
}
