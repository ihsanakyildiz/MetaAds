import type { CreativeKind } from "@prisma/client";
import type {
  CreativeAction,
  CreativeCard,
  CreativeConfidence,
  CreativesInsight,
  CreativesPayload,
} from "@/lib/creatives-types";
import { prisma } from "@/lib/prisma";

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fingerprintUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function inferKind(mediaType?: string | null, videoId?: string | null): CreativeKind {
  if (videoId) {
    return "VIDEO";
  }

  return mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
}

function actionFor(probability: number, source: CreativeCard["source"]): CreativeAction {
  if (source === "UPLOAD") {
    return "TEST";
  }

  if (probability >= 55) {
    return "USE";
  }

  if (probability >= 35) {
    return "TEST";
  }

  return "AVOID";
}

function confidenceFor(input: {
  source: CreativeCard["source"];
  adsCount: number;
  purchases: number;
  clicks: number;
  spend: number;
}): CreativeConfidence {
  if (input.source === "UPLOAD") {
    return "LOW";
  }

  if (input.purchases >= 5 || input.adsCount >= 3) {
    return "HIGH";
  }

  if (input.clicks >= 40 || input.spend >= 15 || input.purchases >= 1) {
    return "MEDIUM";
  }

  return "LOW";
}

function scoreCreative(input: {
  parentProbability: number;
  purchases: number;
  clicks: number;
  spend: number;
  ctr: number;
  activeShare: number;
}) {
  const parentPrior = clamp(input.parentProbability / 100, 0, 1);
  const conversionRate = input.purchases / Math.max(input.clicks, 1);
  const cvrScore = clamp(conversionRate / 0.02, 0, 1);
  const ctrScore = clamp(input.ctr / 2.5, 0, 1);
  const volume = clamp(input.purchases / 8, 0, 1);
  const efficiency = clamp((input.purchases / Math.max(input.spend, 1)) * 8, 0, 1);
  const raw =
    0.3 * parentPrior +
    0.22 * cvrScore +
    0.18 * ctrScore +
    0.16 * volume +
    0.14 * efficiency +
    input.activeShare * 0.04;

  return round(clamp(raw, 0, 1) * 100, 1);
}

function buildReasons(input: {
  source: CreativeCard["source"];
  kind: CreativeKind;
  probability: number;
  purchases: number;
  ctr: number | null;
  adsCount: number;
  kindAverage?: number | null;
}): string[] {
  const reasons: string[] = [];

  if (input.source === "UPLOAD") {
    reasons.push("Henüz yayında değil; skor benzer geçmiş kreatiflerden tahmin.");
    if (input.kindAverage !== null && input.kindAverage !== undefined) {
      reasons.push(
        `Daha önce kullanılan ${input.kind === "VIDEO" ? "videoların" : "görsellerin"} ortalaması %${input.kindAverage.toFixed(0)}.`,
      );
    }
    reasons.push("Küçük bütçeyle A/B testinde doğrulayın.");
    return reasons;
  }

  if (input.purchases >= 8) {
    reasons.push(`${input.purchases} satışla kanıtlanmış bir kreatif.`);
  } else if (input.purchases >= 1) {
    reasons.push(`${input.purchases} satış üretmiş; tekrar kullanılmaya değer.`);
  } else {
    reasons.push("Bu görsel/video henüz satış getirmemiş.");
  }

  if (input.ctr !== null && input.ctr >= 2) {
    reasons.push(`CTR %${input.ctr.toFixed(1)} — dikkat çekme gücü yüksek.`);
  } else if (input.ctr !== null && input.ctr < 0.8 && input.adsCount > 0) {
    reasons.push("Tıklama oranı zayıf; yeni kampanyada riskli.");
  }

  if (input.adsCount >= 3) {
    reasons.push(`${input.adsCount} farklı reklamda tekrar kullanılmış.`);
  }

  if (input.probability >= 55) {
    reasons.push("Yeni kampanyada öncelikli kullanın.");
  } else if (input.probability < 35) {
    reasons.push("Bütçeyi bu kreatife kaydırmayın.");
  }

  return reasons.slice(0, 3);
}

function insightFrom(items: CreativeCard[]): CreativesInsight {
  const scored = items.filter((item) => item.source === "META");
  const best = [...scored].sort((a, b) => b.sellProbability - a.sellProbability)[0];
  const images = scored.filter((item) => item.kind === "IMAGE");
  const videos = scored.filter((item) => item.kind === "VIDEO");
  const imageAvg =
    images.length > 0
      ? images.reduce((sum, item) => sum + item.sellProbability, 0) / images.length
      : null;
  const videoAvg =
    videos.length > 0
      ? videos.reduce((sum, item) => sum + item.sellProbability, 0) / videos.length
      : null;

  if (!best) {
    return {
      tone: "neutral",
      title: "Henüz analiz edilecek geçmiş kreatif yok",
      detail:
        "Kampanya reklamlarını yeniledikten sonra görseller ve videolar satış olasılığıyla sıralanır. Yeni dosya yükleyerek tahmini skor da alabilirsiniz.",
    };
  }

  if (videoAvg !== null && imageAvg !== null && videoAvg >= imageAvg + 6) {
    return {
      tone: "accent",
      title: `Videolar bu portföyde daha iyi satıyor (%${videoAvg.toFixed(0)} vs %${imageAvg.toFixed(0)})`,
      detail: `En güçlü kreatif “${best.name}” — yeni kampanyada kullanırsanız satış alma olasılığı %${best.sellProbability.toFixed(0)}.`,
    };
  }

  if (imageAvg !== null && videoAvg !== null && imageAvg >= videoAvg + 6) {
    return {
      tone: "success",
      title: `Statik görseller videolardan daha iyi dönüşüyor`,
      detail: `Öne çıkan banner “${best.name}”. Bu görseli kullanırsanız satış alma olasılığı %${best.sellProbability.toFixed(0)}.`,
    };
  }

  if (best.sellProbability >= 55) {
    return {
      tone: "success",
      title: `Bu görseli kullanırsanız satış alma olasılığınız %${best.sellProbability.toFixed(0)}`,
      detail: `“${best.name}” geçmiş satış, tıklama ve ebeveyn reklam seti skoruna göre en güçlü kreatif.`,
    };
  }

  return {
    tone: "warning",
    title: "Güçlü bir kazanan henüz net değil",
    detail: `En iyi aday “${best.name}” (%${best.sellProbability.toFixed(0)}). Yeni yüklemeleri küçük bütçeyle test edin.`,
  };
}

export async function buildCreativeRecommendations(): Promise<CreativesPayload> {
  const [ads, scores, uploads] = await Promise.all([
    prisma.metaAd.findMany({
      include: {
        adSet: {
          select: {
            id: true,
            name: true,
            metaAdSetId: true,
            spend: true,
            effectiveStatus: true,
            campaign: {
              select: {
                id: true,
                name: true,
                account: {
                  select: { currency: true },
                },
              },
            },
          },
        },
      },
      take: 2000,
    }),
    prisma.salesScore.findMany({
      where: { scope: "ADSET" },
      select: {
        metaId: true,
        sellProbability: true,
        totalPurchases: true,
      },
    }),
    prisma.creativeUpload.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const scoreByAdSet = new Map(
    scores.map((score) => [score.metaId, score]),
  );

  const adsBySet = new Map<string, typeof ads>();
  for (const ad of ads) {
    const list = adsBySet.get(ad.adSetId) ?? [];
    list.push(ad);
    adsBySet.set(ad.adSetId, list);
  }

  type Acc = {
    id: string;
    name: string;
    kind: CreativeKind;
    previewUrl: string | null;
    headline: string | null;
    spend: number;
    clicks: number;
    impressions: number;
    purchases: number;
    parentWeight: number;
    parentScoreSum: number;
    adsCount: number;
    activeAds: number;
    campaigns: Set<string>;
    usedIn: string[];
    currency: string | null;
  };

  const groups = new Map<string, Acc>();

  for (const ad of ads) {
    const preview = ad.thumbnailUrl;
    const key = preview
      ? `meta:${fingerprintUrl(preview)}`
      : `meta:text:${ad.headline ?? ad.name}:${ad.adSetId}`;
    const siblings = adsBySet.get(ad.adSetId) ?? [];
    const siblingSpend = siblings.reduce((sum, row) => sum + toNumber(row.spend), 0);
    const adSpend = toNumber(ad.spend);
    const share =
      siblingSpend > 0 ? adSpend / siblingSpend : siblings.length > 0 ? 1 / siblings.length : 1;
    const parent = scoreByAdSet.get(ad.adSet.metaAdSetId);
    const purchases = (parent?.totalPurchases ?? 0) * share;
    const kind = inferKind(ad.mediaType, ad.videoId);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        id: key,
        name: ad.headline || ad.name,
        kind,
        previewUrl: preview,
        headline: ad.headline,
        spend: adSpend,
        clicks: toNumber(ad.clicks),
        impressions: toNumber(ad.impressions),
        purchases,
        parentWeight: parent ? 1 : 0,
        parentScoreSum: parent?.sellProbability ?? 0,
        adsCount: 1,
        activeAds: ad.effectiveStatus === "ACTIVE" ? 1 : 0,
        campaigns: new Set([ad.adSet.campaign.name]),
        usedIn: [ad.adSet.campaign.name],
        currency: ad.adSet.campaign.account.currency,
      });
      continue;
    }

    current.spend += adSpend;
    current.clicks += toNumber(ad.clicks);
    current.impressions += toNumber(ad.impressions);
    current.purchases += purchases;
    current.parentWeight += parent ? 1 : 0;
    current.parentScoreSum += parent?.sellProbability ?? 0;
    current.adsCount += 1;
    current.activeAds += ad.effectiveStatus === "ACTIVE" ? 1 : 0;
    current.campaigns.add(ad.adSet.campaign.name);
    if (current.usedIn.length < 3 && !current.usedIn.includes(ad.adSet.campaign.name)) {
      current.usedIn.push(ad.adSet.campaign.name);
    }
    if (!current.previewUrl && preview) {
      current.previewUrl = preview;
    }
    if (kind === "VIDEO") {
      current.kind = "VIDEO";
    }
  }

  const metaItems: CreativeCard[] = [...groups.values()].map((group) => {
    const ctr =
      group.impressions > 0 ? (group.clicks / group.impressions) * 100 : null;
    const parentProbability =
      group.parentWeight > 0 ? group.parentScoreSum / group.parentWeight : 25;
    const sellProbability = scoreCreative({
      parentProbability,
      purchases: group.purchases,
      clicks: group.clicks,
      spend: group.spend,
      ctr: ctr ?? 0,
      activeShare: group.activeAds / Math.max(group.adsCount, 1),
    });
    const source = "META" as const;
    const purchases = round(group.purchases, 1);

    return {
      id: group.id,
      name: group.name,
      kind: group.kind,
      source,
      previewUrl: group.previewUrl,
      headline: group.headline,
      sellProbability,
      confidence: confidenceFor({
        source,
        adsCount: group.adsCount,
        purchases,
        clicks: group.clicks,
        spend: group.spend,
      }),
      action: actionFor(sellProbability, source),
      reasons: [],
      adsCount: group.adsCount,
      campaignsCount: group.campaigns.size,
      spend: round(group.spend, 2),
      clicks: group.clicks,
      impressions: group.impressions,
      ctr: ctr === null ? null : round(ctr, 2),
      purchases,
      currency: group.currency,
      usedIn: group.usedIn,
    };
  });

  const imageAvg = averageProbability(metaItems.filter((item) => item.kind === "IMAGE"));
  const videoAvg = averageProbability(metaItems.filter((item) => item.kind === "VIDEO"));

  for (const item of metaItems) {
    item.reasons = buildReasons({
      source: item.source,
      kind: item.kind,
      probability: item.sellProbability,
      purchases: item.purchases,
      ctr: item.ctr,
      adsCount: item.adsCount,
      kindAverage: item.kind === "VIDEO" ? videoAvg : imageAvg,
    });
  }

  const uploadItems: CreativeCard[] = uploads.map((upload) => {
    const kindAverage = upload.kind === "VIDEO" ? videoAvg : imageAvg;
    const baseline = kindAverage ?? averageProbability(metaItems) ?? 28;
    const sellProbability = round(clamp(baseline * 0.82, 8, 72), 1);

    return {
      id: `upload:${upload.id}`,
      name: upload.name,
      kind: upload.kind,
      source: "UPLOAD",
      previewUrl: upload.filePath,
      headline: null,
      sellProbability,
      confidence: "LOW",
      action: "TEST",
      reasons: buildReasons({
        source: "UPLOAD",
        kind: upload.kind,
        probability: sellProbability,
        purchases: 0,
        ctr: null,
        adsCount: 0,
        kindAverage,
      }),
      adsCount: 0,
      campaignsCount: 0,
      spend: 0,
      clicks: 0,
      impressions: 0,
      ctr: null,
      purchases: 0,
      currency: null,
      usedIn: ["Yüklenen taslak"],
    };
  });

  const items = [...uploadItems, ...metaItems].sort(
    (left, right) => right.sellProbability - left.sellProbability,
  );

  const probabilities = items.map((item) => item.sellProbability);
  const avgProbability =
    probabilities.length > 0
      ? round(probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length, 1)
      : null;

  const distribution = [
    { key: "0-20", label: "0–20%", min: 0, max: 20 },
    { key: "20-40", label: "20–40%", min: 20, max: 40 },
    { key: "40-60", label: "40–60%", min: 40, max: 60 },
    { key: "60-80", label: "60–80%", min: 60, max: 80 },
    { key: "80-100", label: "80–100%", min: 80, max: 101 },
  ].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: items.filter(
      (item) => item.sellProbability >= bucket.min && item.sellProbability < bucket.max,
    ).length,
  }));

  const kindStats = (["IMAGE", "VIDEO"] as const).map((kind) => {
    const rows = items.filter((item) => item.kind === kind && item.source === "META");
    return {
      kind,
      count: rows.length + items.filter((item) => item.kind === kind && item.source === "UPLOAD").length,
      avgProbability: averageProbability(rows) ?? 0,
      purchases: round(
        rows.reduce((sum, item) => sum + item.purchases, 0),
        1,
      ),
    };
  });

  return {
    items: items.slice(0, 80),
    stats: {
      total: items.length,
      metaCount: metaItems.length,
      uploadCount: uploadItems.length,
      imageCount: items.filter((item) => item.kind === "IMAGE").length,
      videoCount: items.filter((item) => item.kind === "VIDEO").length,
      avgProbability,
      bestProbability: items[0]?.sellProbability ?? null,
      useCount: items.filter((item) => item.action === "USE").length,
      testCount: items.filter((item) => item.action === "TEST").length,
      avoidCount: items.filter((item) => item.action === "AVOID").length,
      totalPurchases: round(
        metaItems.reduce((sum, item) => sum + item.purchases, 0),
        1,
      ),
    },
    insight: insightFrom(items),
    distribution,
    kindStats,
    topBars: items.slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      probability: item.sellProbability,
      kind: item.kind,
    })),
  };
}

function averageProbability(items: CreativeCard[]) {
  if (items.length === 0) {
    return null;
  }

  return round(
    items.reduce((sum, item) => sum + item.sellProbability, 0) / items.length,
    1,
  );
}
