import { completeJson } from "@/lib/ai";
import type {
  AiAction,
  AiActionPriority,
  AiBrief,
  AiBriefTone,
} from "@/lib/ai-types";
import type { DashboardPayload } from "@/lib/dashboard-types";

const CACHE_TTL_MS = 20 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  brief: AiBrief;
};

const briefCache = new Map<string, CacheEntry>();

function cacheKey(since: string, until: string) {
  return `${since}|${until}`;
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

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 5);
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
    .slice(0, 5);
}

function compactDashboard(data: DashboardPayload) {
  return {
    since: data.since,
    until: data.until,
    currency: data.currency,
    kpis: data.kpis,
    ruleInsight: data.insight,
    topCampaigns: data.topCampaigns.slice(0, 5).map((row) => ({
      name: row.name,
      spend: row.spend,
      purchases: row.purchases,
      clicks: row.clicks,
      ctr: row.ctr,
      sellProbability: row.sellProbability,
    })),
    topAdSets: data.topAdSets.slice(0, 6).map((row) => ({
      name: row.name,
      spend: row.spend,
      purchases: row.purchases,
      sellProbability: row.sellProbability,
    })),
    topAds: data.topAds.slice(0, 4).map((row) => ({
      name: row.name,
      clicks: row.clicks,
      ctr: row.ctr,
      purchases: row.purchases,
    })),
    topCreatives: data.topCreatives.slice(0, 4).map((row) => ({
      name: row.name,
      kind: row.kind,
      sellProbability: row.sellProbability,
    })),
    topProducts: data.topProducts.slice(0, 5),
    alerts: data.alerts.slice(0, 6).map((alert) => ({
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      adSetName: alert.adSetName,
      recommendation: alert.recommendation,
    })),
  };
}

const SYSTEM_PROMPT = `Sen Meta Ads medya alımı analistisin. Türkçe, net ve operasyonel yaz.
Sadece verilen sayıları kullan; uydurma harcama, satış veya ROAS yazma.
Satış yoksa kapatma / süre verme önerisini bütçe koruma uyarılarına dayandır.
Yanıt yalnızca şu JSON şeması olsun:
{
  "headline": "kısa başlık",
  "summary": "2-3 cümle durum özeti",
  "tone": "success" | "warning" | "accent" | "neutral",
  "actions": [{"title":"...","detail":"...","priority":"high"|"medium"|"low"}],
  "closeCandidates": ["reklam seti veya kampanya adı"],
  "scaleCandidates": ["ölçeklenecek set veya kreatif adı"],
  "creativeNote": "görsel/video önerisi"
}
En fazla 5 aksiyon yaz. Token, şifre veya hesap kimliği isteme.`;

export async function generateDashboardBrief(
  data: DashboardPayload,
  options?: { force?: boolean },
): Promise<AiBrief> {
  const key = cacheKey(data.since, data.until);
  const cached = briefCache.get(key);

  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return { ...cached.brief, cached: true };
  }

  const result = await completeJson(
    SYSTEM_PROMPT,
    `Seçilen dönem performansı:\n${JSON.stringify(compactDashboard(data))}`,
  );

  const brief: AiBrief = {
    headline: asString(result.data.headline, "Dönem analizi"),
    summary: asString(
      result.data.summary,
      "Model özet üretemedi; sayıları dashboard kartlarından okuyun.",
    ),
    tone: asTone(result.data.tone),
    actions: asActions(result.data.actions),
    closeCandidates: asStringList(result.data.closeCandidates),
    scaleCandidates: asStringList(result.data.scaleCandidates),
    creativeNote: asString(result.data.creativeNote),
    provider: result.provider,
    model: result.model,
    cached: false,
    generatedAt: new Date().toISOString(),
  };

  briefCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    brief,
  });

  return brief;
}
