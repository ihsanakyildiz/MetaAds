import { SalesScope } from "@prisma/client";
import { completeJson, normalizeMediaUrls } from "@/lib/ai";
import type {
  AiAction,
  AiActionPriority,
  AiBrief,
  AiBriefTone,
  AiCreativeReview,
  AiScenario,
} from "@/lib/ai-types";
import { queryAds, queryAdSets } from "@/lib/children";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 20 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  brief: AiBrief;
};

const briefCache = new Map<string, CacheEntry>();

function cacheKey(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join("|");
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asTone(value: unknown): AiBriefTone {
  switch (value) {
    case "success":
    case "warning":
    case "accent":
    case "neutral":
      return value;
    default:
      return "accent";
  }
}

function asPriority(value: unknown): AiActionPriority {
  switch (value) {
    case "high":
    case "medium":
    case "low":
      return value;
    default:
      return "medium";
  }
}

function asLikelihood(value: unknown): AiScenario["likelihood"] {
  switch (value) {
    case "high":
    case "medium":
    case "low":
      return value;
    default:
      return "medium";
  }
}

function asVerdict(value: unknown): AiCreativeReview["verdict"] {
  switch (value) {
    case "use":
    case "test":
    case "avoid":
      return value;
    default:
      return "test";
  }
}

function asKind(value: unknown): AiCreativeReview["kind"] {
  switch (value) {
    case "IMAGE":
    case "VIDEO":
    case "UNKNOWN":
      return value;
    default:
      return "UNKNOWN";
  }
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 8);
}

function asActions(value: unknown): AiAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = asString(row.title);

      if (!title) {
        return null;
      }

      return {
        title,
        detail: asString(row.detail),
        priority: asPriority(row.priority),
      } satisfies AiAction;
    })
    .filter((item): item is AiAction => Boolean(item))
    .slice(0, 8);
}

function asScenarios(value: unknown): AiScenario[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = asString(row.title);

      if (!title) {
        return null;
      }

      return {
        title,
        detail: asString(row.detail),
        likelihood: asLikelihood(row.likelihood),
      } satisfies AiScenario;
    })
    .filter((item): item is AiScenario => Boolean(item))
    .slice(0, 6);
}

function asCreativeReviews(value: unknown): AiCreativeReview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const name = asString(row.name);

      if (!name) {
        return null;
      }

      return {
        name,
        kind: asKind(row.kind),
        verdict: asVerdict(row.verdict),
        notes: asString(row.notes),
      } satisfies AiCreativeReview;
    })
    .filter((item): item is AiCreativeReview => Boolean(item))
    .slice(0, 6);
}

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function compactDashboard(data: DashboardPayload) {
  return {
    since: data.since,
    until: data.until,
    currency: data.currency,
    kpis: data.kpis,
    ruleInsight: data.insight,
    daily: data.days.slice(-21).map((day) => ({
      date: day.date,
      weekday: day.weekday,
      spend: day.spend,
      purchases: day.purchases,
      clicks: day.clicks,
      impressions: day.impressions,
    })),
    topCampaigns: data.topCampaigns.slice(0, 8).map((row) => ({
      name: row.name,
      spend: row.spend,
      purchases: row.purchases,
      clicks: row.clicks,
      ctr: row.ctr,
      sellProbability: row.sellProbability,
    })),
    topAdSets: data.topAdSets.slice(0, 8).map((row) => ({
      name: row.name,
      spend: row.spend,
      purchases: row.purchases,
      clicks: row.clicks,
      sellProbability: row.sellProbability,
    })),
    topAds: data.topAds.slice(0, 8).map((row) => ({
      name: row.name,
      clicks: row.clicks,
      ctr: row.ctr,
      purchases: row.purchases,
      spend: row.spend,
    })),
    topCreatives: data.topCreatives.slice(0, 8).map((row) => ({
      name: row.name,
      kind: row.kind,
      sellProbability: row.sellProbability,
    })),
    topProducts: data.topProducts.slice(0, 8),
    alerts: data.alerts.slice(0, 8).map((alert) => ({
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      adSetName: alert.adSetName,
      recommendation: alert.recommendation,
      spend: alert.spend,
      purchases: alert.purchases,
      ctr: alert.ctr,
    })),
  };
}

const SYSTEM_PROMPT = `Sen kıdemli bir Meta Ads medya alımı analistisin. Türkçe, derin ve operasyonel yaz.
Sadece verilen sayıları, uyarıları ve (varsa) görselleri kullan. Harcama, satış, ROAS veya CTR uydurma.
Bütün alternatif açıklamaları karşılaştır: fiyat/teklif, zayıf kreatif, yanlış kitle, öğrenme evresi, stok, sezon, yetersiz hacim, ROAS, ürün tavanı.
Her senaryoya high/medium/low olasılık ver ve hangi istatistiğin bunu desteklediğini yaz.
Görsel veya video karesi geldiyse: teklif netliği, metin okunurluğu, yüz/ürün görünürlüğü, kontrast, ilk 3 saniye vaadi ve tıklama/satışla uyumu yorumla.
Videolarda elindeki kare bir kapak/thumbnail'dır; hareketi göremezsin, bunu belirt.
Yanıt yalnızca şu JSON olsun:
{
  "headline": "kısa başlık",
  "summary": "4-6 cümle derin özet",
  "tone": "success" | "warning" | "accent" | "neutral",
  "actions": [{"title":"...","detail":"...","priority":"high"|"medium"|"low"}],
  "scenarios": [{"title":"...","detail":"...","likelihood":"high"|"medium"|"low"}],
  "closeCandidates": ["ad"],
  "scaleCandidates": ["ad"],
  "creativeNote": "genel kreatif yönü",
  "creativeReviews": [{"name":"...","kind":"IMAGE"|"VIDEO"|"UNKNOWN","verdict":"use"|"test"|"avoid","notes":"..."}]
}
En fazla 8 aksiyon, 6 senaryo, 6 kreatif incelemesi. Token, şifre veya hesap kimliği isteme.`;

function toBrief(
  data: Record<string, unknown>,
  meta: Pick<AiBrief, "provider" | "model" | "inspectedMedia">,
): AiBrief {
  return {
    headline: asString(data.headline, "Dönem analizi"),
    summary: asString(
      data.summary,
      "Model özet üretemedi; sayıları panel kartlarından okuyun.",
    ),
    tone: asTone(data.tone),
    actions: asActions(data.actions),
    closeCandidates: asStringList(data.closeCandidates),
    scaleCandidates: asStringList(data.scaleCandidates),
    creativeNote: asString(data.creativeNote),
    scenarios: asScenarios(data.scenarios),
    creativeReviews: asCreativeReviews(data.creativeReviews),
    inspectedMedia: meta.inspectedMedia,
    provider: meta.provider,
    model: meta.model,
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

async function storeBrief(key: string, brief: AiBrief) {
  briefCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    brief,
  });
}

export async function generateDashboardBrief(
  data: DashboardPayload,
  options?: { force?: boolean },
): Promise<AiBrief> {
  const key = cacheKey(["dashboard", data.since, data.until]);
  const cached = briefCache.get(key);

  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return { ...cached.brief, cached: true };
  }

  const images = normalizeMediaUrls(
    [
      ...data.topAds.map((ad) => ad.thumbnailUrl ?? ""),
      ...data.topCreatives.map((item) => item.previewUrl ?? ""),
    ],
    3,
  );

  const result = await completeJson(
    SYSTEM_PROMPT,
    `Portföy dönemi. Görseller sırayla en güçlü reklamlara aittir.\n${JSON.stringify(compactDashboard(data))}`,
    undefined,
    images,
  );

  const brief = toBrief(result.data, {
    provider: result.provider,
    model: result.model,
    inspectedMedia: images.length,
  });
  await storeBrief(key, brief);
  return brief;
}

export async function generateAdSetPageBrief(input: {
  campaignId: string;
  since: string;
  until: string;
  force?: boolean;
}): Promise<AiBrief> {
  const key = cacheKey(["adset", input.campaignId, input.since, input.until]);
  const cached = briefCache.get(key);

  if (!input.force && cached && cached.expiresAt > Date.now()) {
    return { ...cached.brief, cached: true };
  }

  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: input.campaignId },
    include: {
      account: {
        select: { name: true, currency: true },
      },
    },
  });

  if (!campaign) {
    throw new Error("Kampanya bulunamadı.");
  }

  const { items, analysis, products, alerts } = await queryAdSets(
    input.campaignId,
    { since: input.since, until: input.until },
  );

  const scores = await prisma.salesScore.findMany({
    where: {
      scope: SalesScope.ADSET,
      metaId: { in: items.map((item) => item.metaId) },
    },
  });
  const scoreByMeta = new Map(scores.map((row) => [row.metaId, row]));

  const ads = await prisma.metaAd.findMany({
    where: { adSet: { campaignId: input.campaignId } },
    select: {
      name: true,
      headline: true,
      body: true,
      thumbnailUrl: true,
      videoId: true,
      mediaType: true,
      spend: true,
      clicks: true,
      impressions: true,
      ctr: true,
      effectiveStatus: true,
      adSet: { select: { name: true } },
    },
  });

  const rankedAds = [...ads]
    .sort((left, right) => toNumber(right.spend) - toNumber(left.spend))
    .slice(0, 12);

  const images = normalizeMediaUrls(
    rankedAds.map((ad) => ad.thumbnailUrl ?? ""),
    3,
  );

  const payload = {
    since: input.since,
    until: input.until,
    currency: campaign.account.currency,
    campaign: {
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.effectiveStatus,
      dailyBudget: campaign.dailyBudget,
      lifetimeBudget: campaign.lifetimeBudget,
      spend: campaign.spend,
      clicks: campaign.clicks,
      impressions: campaign.impressions,
      ctr: campaign.ctr,
    },
    analysis,
    adSets: items.map((item) => {
      const score = scoreByMeta.get(item.metaId);
      return {
        name: item.name,
        status: item.effectiveStatus,
        optimization: item.extra,
        dailyBudget: item.dailyBudget,
        lifetimeBudget: item.lifetimeBudget,
        spend: item.spend,
        clicks: item.clicks,
        impressions: item.impressions,
        ctr: item.ctr,
        purchases: item.purchases,
        startTime: item.startTime,
        guard: item.decision,
        sellProbability: score?.sellProbability ?? null,
        conversionRate: score?.conversionRate ?? null,
        hitRate: score?.hitRate ?? null,
        consistency: score?.consistency ?? null,
        trend: score?.trend ?? null,
        salesDays: score?.salesDays ?? null,
        activeDays: score?.activeDays ?? null,
      };
    }),
    ads: rankedAds.map((ad) => ({
      name: ad.name,
      adSetName: ad.adSet.name,
      status: ad.effectiveStatus,
      headline: ad.headline,
      body: ad.body,
      mediaType: ad.mediaType,
      videoId: ad.videoId,
      kind: ad.videoId || ad.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
      spend: ad.spend,
      clicks: ad.clicks,
      impressions: ad.impressions,
      ctr: ad.ctr,
      hasPreview: Boolean(ad.thumbnailUrl),
    })),
    products: products.slice(0, 8).map((product) => ({
      name: product.name ?? product.productId,
      purchases: product.purchases,
      spend: product.spend,
      clicks: product.clicks,
      countries: product.countries.slice(0, 3),
      genders: product.genders.slice(0, 3),
      ages: product.ages.slice(0, 3),
    })),
    alerts: alerts.slice(0, 8),
    attachedPreviews: images.length,
  };

  const result = await completeJson(
    SYSTEM_PROMPT,
    `Kampanya içi reklam seti analizi. Ekli görseller en çok harcayan reklamlardandır; video ise kapak karesidir.\n${JSON.stringify(payload)}`,
    undefined,
    images,
  );

  const brief = toBrief(result.data, {
    provider: result.provider,
    model: result.model,
    inspectedMedia: images.length,
  });
  await storeBrief(key, brief);
  return brief;
}

export async function generateAdPageBrief(input: {
  adSetId: string;
  since: string;
  until: string;
  force?: boolean;
}): Promise<AiBrief> {
  const key = cacheKey(["ad", input.adSetId, input.since, input.until]);
  const cached = briefCache.get(key);

  if (!input.force && cached && cached.expiresAt > Date.now()) {
    return { ...cached.brief, cached: true };
  }

  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: input.adSetId },
    include: {
      campaign: {
        select: {
          name: true,
          objective: true,
          effectiveStatus: true,
          account: { select: { currency: true } },
        },
      },
    },
  });

  if (!adSet) {
    throw new Error("Reklam seti bulunamadı.");
  }

  const { items, analysis, products } = await queryAds(input.adSetId, {
    since: input.since,
    until: input.until,
  });

  const ads = await prisma.metaAd.findMany({
    where: { adSetId: input.adSetId },
    select: {
      name: true,
      headline: true,
      body: true,
      thumbnailUrl: true,
      videoId: true,
      mediaType: true,
      spend: true,
      clicks: true,
      impressions: true,
      ctr: true,
      effectiveStatus: true,
    },
  });

  const insightByName = new Map(items.map((item) => [item.name, item]));
  const images = normalizeMediaUrls(
    ads.map((ad) => ad.thumbnailUrl ?? ""),
    3,
  );

  const payload = {
    since: input.since,
    until: input.until,
    currency: adSet.campaign.account.currency,
    campaign: {
      name: adSet.campaign.name,
      objective: adSet.campaign.objective,
      status: adSet.campaign.effectiveStatus,
    },
    adSet: {
      name: adSet.name,
      status: adSet.effectiveStatus,
      optimization: adSet.optimizationGoal,
      dailyBudget: adSet.dailyBudget,
      lifetimeBudget: adSet.lifetimeBudget,
      spend: adSet.spend,
      clicks: adSet.clicks,
      impressions: adSet.impressions,
      ctr: adSet.ctr,
      startTime: adSet.startTime,
    },
    analysis,
    ads: ads.map((ad) => {
      const listed = insightByName.get(ad.name);
      return {
        name: ad.name,
        status: ad.effectiveStatus,
        headline: ad.headline,
        body: ad.body,
        mediaType: ad.mediaType,
        videoId: ad.videoId,
        kind: ad.videoId || ad.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
        spend: listed?.spend ?? ad.spend,
        clicks: listed?.clicks ?? ad.clicks,
        impressions: listed?.impressions ?? ad.impressions,
        ctr: listed?.ctr ?? ad.ctr,
        hasPreview: Boolean(ad.thumbnailUrl),
      };
    }),
    products: products.slice(0, 8).map((product) => ({
      name: product.name ?? product.productId,
      purchases: product.purchases,
      spend: product.spend,
      clicks: product.clicks,
      countries: product.countries.slice(0, 3),
      genders: product.genders.slice(0, 3),
      ages: product.ages.slice(0, 3),
    })),
    attachedPreviews: images.length,
  };

  const result = await completeJson(
    SYSTEM_PROMPT,
    `Reklam seti içi reklam ve kreatif analizi. Ekli görseller bu setteki reklamlardandır; video ise kapak karesidir. Her görseli metin/teklif/ürün netliği açısından oku ve CTR-satış ile eşleştir.\n${JSON.stringify(payload)}`,
    undefined,
    images,
  );

  const brief = toBrief(result.data, {
    provider: result.provider,
    model: result.model,
    inspectedMedia: images.length,
  });
  await storeBrief(key, brief);
  return brief;
}
