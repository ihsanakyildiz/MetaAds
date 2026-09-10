import { CompetitorKind } from "@prisma/client";
import { completeWebResearch } from "@/lib/ai";
import type {
  CompetitorAdHit,
  CompetitorInsight,
  CompetitorKind as AppKind,
  CompetitorPrice,
  CompetitorSource,
  CompetitorWatchView,
} from "@/lib/competitors-types";
import { collectSitePrices } from "@/lib/competitor-page";
import { searchAdLibrary } from "@/lib/meta-ad-library";
import { prisma } from "@/lib/prisma";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item)).filter(Boolean).slice(0, 8);
}

function asPrices(value: unknown): CompetitorPrice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const seller = asString(row.seller, "Bilinmeyen satıcı");

    if (!seller) {
      return [];
    }

    return [
      {
        seller,
        product: asString(row.product),
        price: asNumber(row.price),
        currency: asString(row.currency) || null,
        url: asString(row.url) || null,
        note: asString(row.note),
        verified: row.verified === true,
      } satisfies CompetitorPrice,
    ];
  }).slice(0, 12);
}

function asAds(value: unknown): CompetitorAdHit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const platform = row.platform;
      const resolved =
        platform === "facebook" ||
        platform === "instagram" ||
        platform === "meta" ||
        platform === "web"
          ? platform
          : "web";

      return {
        platform: resolved,
        advertiser: asString(row.advertiser, "Bilinmeyen"),
        message: asString(row.message),
        offer: asString(row.offer),
        url: asString(row.url) || null,
        active: typeof row.active === "boolean" ? row.active : null,
      } satisfies CompetitorAdHit;
    })
    .filter((item): item is CompetitorAdHit => Boolean(item))
    .slice(0, 12);
}

function asSources(value: unknown): CompetitorSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const url = asString(row.url);
      if (!url) {
        return null;
      }

      return {
        title: asString(row.title, url),
        url,
      } satisfies CompetitorSource;
    })
    .filter((item): item is CompetitorSource => Boolean(item))
    .slice(0, 10);
}

function asTone(value: unknown): CompetitorInsight["tone"] {
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

function parseInsight(
  data: Record<string, unknown>,
  model: string,
  libraryNote: string,
): CompetitorInsight {
  const range =
    data.priceRange && typeof data.priceRange === "object"
      ? (data.priceRange as Record<string, unknown>)
      : {};

  return {
    headline: asString(data.headline, "Pazar taraması"),
    summary: asString(data.summary),
    tone: asTone(data.tone),
    priceRange: {
      min: asNumber(range.min),
      max: asNumber(range.max),
      typical: asNumber(range.typical),
      currency: asString(range.currency) || "TRY",
    },
    prices: asPrices(data.prices),
    ads: asAds(data.ads),
    threats: asStringList(data.threats),
    opportunities: asStringList(data.opportunities),
    sources: asSources(data.sources),
    libraryNote,
    generatedAt: new Date().toISOString(),
    model,
  };
}

function toView(
  watch: {
    id: string;
    kind: CompetitorKind;
    name: string;
    query: string;
    website: string | null;
    pageId: string | null;
    country: string;
    notes: string | null;
    enabled: boolean;
    updatedAt: Date;
    reports: Array<{ payload: string }>;
  },
): CompetitorWatchView {
  const latest = watch.reports[0];
  let lastReport: CompetitorInsight | null = null;

  if (latest) {
    try {
      lastReport = JSON.parse(latest.payload) as CompetitorInsight;
    } catch {
      lastReport = null;
    }
  }

  return {
    id: watch.id,
    kind: watch.kind,
    name: watch.name,
    query: watch.query,
    website: watch.website,
    pageId: watch.pageId,
    country: watch.country,
    notes: watch.notes,
    enabled: watch.enabled,
    updatedAt: watch.updatedAt.toISOString(),
    lastReport,
  };
}

export async function listCompetitorWatches(): Promise<CompetitorWatchView[]> {
  const rows = await prisma.competitorWatch.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return rows.map(toView);
}

export async function createCompetitorWatch(input: {
  kind: AppKind;
  name: string;
  query: string;
  website?: string;
  pageId?: string;
  country?: string;
  notes?: string;
  createdById: string;
}) {
  const row = await prisma.competitorWatch.create({
    data: {
      kind: input.kind,
      name: input.name.trim(),
      query: (input.query || input.name).trim(),
      website: input.website?.trim() || null,
      pageId: input.pageId?.trim() || null,
      country: (input.country || "TR").trim().toUpperCase(),
      notes: input.notes?.trim() || null,
      createdById: input.createdById,
    },
    include: { reports: true },
  });

  return toView({ ...row, reports: [] });
}

export async function deleteCompetitorWatch(id: string) {
  await prisma.competitorWatch.delete({ where: { id } });
}

export async function listOwnProductHints() {
  const rows = await prisma.salesProductStat.findMany({
    where: { name: { not: null } },
    distinct: ["name"],
    orderBy: { purchases: "desc" },
    take: 16,
    select: { name: true, productId: true, purchases: true },
  });

  return rows
    .map((row) => ({
      name: row.name ?? row.productId,
      productId: row.productId,
      purchases: row.purchases,
    }))
    .filter((row) => row.name);
}

const RESEARCH_PROMPT = `Sen e-ticaret pazar analistisin. Türkçe yaz.
siteEvidence.prices dizisi, verdiğimiz rakip sitesinin KENDİ arama motorundan AZ ÖNCE çekilmiş doğrulanmış fiyatlardır.
siteEvidence.search.template o sitenin tespit edilen arama adresidir (ör. /Arama?1&kelime=).
O satıcı / o URL için başka fiyat UYDURMA. siteEvidence.prices varsa bunları prices listesinin en üstüne koy, verified=true yaz.
siteEvidence.prices boşsa o site için price=null ve note="sitede bu ürüne ait net fiyat bulunamadı" yaz; ezber veya eski arama sonucu kullanma.
Diğer pazaryeri fiyatları yalnızca kaynak URL ile birlikte ve gerçekten görüldüyse eklenebilir.
Yanıt yalnızca JSON:
{
  "headline":"",
  "summary":"",
  "tone":"success"|"warning"|"accent"|"neutral",
  "priceRange":{"min":0,"max":0,"typical":0,"currency":"TRY"},
  "prices":[{"seller":"","product":"","price":0,"currency":"TRY","url":"","note":"","verified":true}],
  "ads":[{"platform":"facebook"|"instagram"|"meta"|"web","advertiser":"","message":"","offer":"","url":"","active":true}],
  "threats":[""],
  "opportunities":[""],
  "sources":[{"title":"","url":""}]
}`;

function hostOf(value?: string | null) {
  if (!value) {
    return "";
  }

  try {
    return new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    ).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function applyVerifiedPrices(
  insight: CompetitorInsight,
  verified: Awaited<ReturnType<typeof collectSitePrices>>["prices"],
  sellerName: string,
  website?: string | null,
) {
  if (verified.length === 0) {
    const host = hostOf(website);
    insight.prices = insight.prices.map((row) => {
      if (host && hostOf(row.url) === host) {
        return {
          ...row,
          price: null,
          verified: false,
          note: row.note || "Kaynak sitede bu ürün için doğrulanmış fiyat yok.",
        };
      }
      return row;
    });
    return;
  }

  const host = hostOf(website);
  const verifiedRows: CompetitorPrice[] = verified.map((price) => ({
    seller: sellerName,
    product: price.product,
    price: price.amount,
    currency: price.currency,
    url: price.url,
    note: "Kaynak siteden anlık okundu.",
    verified: true,
  }));
  const extras = insight.prices.filter((row) => hostOf(row.url) !== host);
  insight.prices = [...verifiedRows, ...extras];

  const amounts = insight.prices
    .map((row) => row.price)
    .filter((value): value is number => value !== null);
  if (amounts.length > 0) {
    const sorted = [...amounts].sort((left, right) => left - right);
    insight.priceRange = {
      min: sorted[0] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      typical: sorted[Math.floor(sorted.length / 2)] ?? null,
      currency: verified[0]?.currency ?? insight.priceRange.currency,
    };
  }
}

export async function analyzeCompetitorWatch(id: string) {
  const watch = await prisma.competitorWatch.findUnique({
    where: { id },
  });

  if (!watch) {
    throw new Error("Takip kaydı bulunamadı.");
  }

  const [library, ownProducts, siteEvidence] = await Promise.all([
    searchAdLibrary({
      query: watch.query || watch.name,
      country: watch.country,
      pageId: watch.pageId,
    }),
    listOwnProductHints(),
    collectSitePrices({
      website: watch.website,
      query: watch.query || watch.name,
      sellerName: watch.name,
    }),
  ]);

  const result = await completeWebResearch(
    RESEARCH_PROMPT,
    JSON.stringify({
      task: "Canlı rakip fiyat ve reklam taraması",
      watch: {
        kind: watch.kind,
        name: watch.name,
        query: watch.query,
        website: watch.website,
        pageId: watch.pageId,
        country: watch.country,
        notes: watch.notes,
      },
      siteEvidence,
      ownTopProducts: ownProducts.slice(0, 8),
      officialAdLibrary: library.hits.slice(0, 10),
      libraryNote: library.note,
    }),
    watch.country,
  );

  const insight = parseInsight(
    result.data,
    result.model,
    [library.note, siteEvidence.note].filter(Boolean).join(" "),
  );
  applyVerifiedPrices(insight, siteEvidence.prices, watch.name, watch.website);

  for (const price of siteEvidence.prices) {
    if (!insight.sources.some((source) => source.url === price.url)) {
      insight.sources.unshift({
        title: price.product || watch.name,
        url: price.url,
      });
    }
  }

  if (library.hits.length && insight.ads.length === 0) {
    insight.ads = library.hits.slice(0, 8).map((hit) => ({
      platform: hit.platforms.includes("instagram") ? "instagram" : "facebook",
      advertiser: hit.pageName,
      message: hit.body,
      offer: hit.coverage,
      url: hit.snapshotUrl,
      active: !hit.stopTime,
    }));
  }

  await prisma.competitorReport.create({
    data: {
      watchId: watch.id,
      headline: insight.headline,
      summary: insight.summary,
      payload: JSON.stringify(insight),
      sourceCount: insight.sources.length + library.hits.length,
    },
  });

  await prisma.competitorWatch.update({
    where: { id: watch.id },
    data: { updatedAt: new Date() },
  });

  return insight;
}
