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
import { collectSitePrices, type PagePrice, type SiteEvidence } from "@/lib/competitor-page";
import { searchAdLibrary } from "@/lib/meta-ad-library";
import { collectMarketPrices } from "@/lib/search-engines";
import {
  isSearchEngineHost,
  parseSearchEngines,
  serializeSearchEngines,
  type SearchEngineId,
} from "@/lib/search-engines-types";
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
        engine: asString(row.engine) || null,
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
    searchTemplate: string | null;
    searchEngines: string | null;
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
    searchTemplate: watch.searchTemplate,
    searchEngines: parseSearchEngines(watch.searchEngines),
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
  searchTemplate?: string;
  searchEngines?: SearchEngineId[];
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
      searchTemplate: input.searchTemplate?.trim() || null,
      searchEngines: serializeSearchEngines(input.searchEngines ?? []),
      pageId: input.pageId?.trim() || null,
      country: (input.country || "TR").trim().toUpperCase(),
      notes: input.notes?.trim() || null,
      createdById: input.createdById,
    },
    include: { reports: true },
  });

  return toView({ ...row, reports: [] });
}

export async function updateCompetitorWatch(
  id: string,
  input: {
    website?: string;
    searchTemplate?: string;
    searchEngines?: SearchEngineId[];
  },
) {
  const row = await prisma.competitorWatch.update({
    where: { id },
    data: {
      website: input.website?.trim() || null,
      searchTemplate: input.searchTemplate?.trim() || null,
      ...(input.searchEngines
        ? { searchEngines: serializeSearchEngines(input.searchEngines) }
        : {}),
    },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return toView(row);
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
marketEvidence.prices arama motorlarında bulunan satıcı siteleri ve fiyatlarıdır. Bunları prices listesine koy.
siteEvidence.prices belirli bir mağazadan okunan fiyatlardır; varsa en üste al, verified=true yaz.
Arama motoru (Google, Bing, Yandex, DuckDuckGo) satıcı değildir; satıcı ürünü satan mağaza sitesidir.
Görmediğin fiyatı uydurma. min / typical / max değerlerini listedeki fiyatlardan hesapla.
Hangi sitede daha ucuz / pahalı olduğunu özetle.
Yanıt yalnızca JSON:
{
  "headline":"",
  "summary":"",
  "tone":"success"|"warning"|"accent"|"neutral",
  "priceRange":{"min":0,"max":0,"typical":0,"currency":"TRY"},
  "prices":[{"seller":"","product":"","price":0,"currency":"TRY","url":"","engine":"google","note":"","verified":true}],
  "ads":[{"platform":"facebook"|"instagram"|"meta"|"web","advertiser":"","message":"","offer":"","url":"","active":true}],
  "threats":[""],
  "opportunities":[""],
  "sources":[{"title":"","url":""}]
}`;

const EXTRACT_PROMPT = `Sen fiyat okuyucusun. visit_website ile verilen TEK adresi aç.
Aranan ürüne ait satış fiyatını (indirimli / KDV dahil etiket) oku.
Görmediğin fiyatı uydurma. Yanıt yalnızca JSON:
{"prices":[{"product":"","price":0,"currency":"TRY","url":""}]}`;

function asRemotePrices(value: unknown, query: string): PagePrice[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const rows = (value as { prices?: unknown }).prices;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const amount = asNumber(row.price);
    const url = asString(row.url);
    if (amount === null || !/^https?:\/\//i.test(url)) {
      return [];
    }

    return [
      {
        amount,
        currency: asString(row.currency, "TRY") || "TRY",
        product: asString(row.product, query),
        url,
        context: "compound-visit",
        verified: true as const,
      },
    ];
  });
}

async function fillMissingSitePrices(
  evidence: Awaited<ReturnType<typeof collectSitePrices>>,
  input: { query: string; sellerName: string; country: string },
) {
  if (evidence.prices.length > 0 || !evidence.searchUrl) {
    return evidence;
  }

  try {
    const result = await completeWebResearch(
      EXTRACT_PROMPT,
      `Adres: ${evidence.searchUrl}\nAranan: ${input.query}\nSatıcı: ${input.sellerName}`,
      input.country,
      ["visit_website"],
    );
    const prices = asRemotePrices(result.data, input.query);
    if (prices.length === 0) {
      return evidence;
    }

    return {
      ...evidence,
      prices,
      note: `${input.sellerName} arama sayfası model tarafından açıldı ve fiyat okundu.`,
    };
  } catch {
    return evidence;
  }
}

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
  blocked = false,
) {
  if (verified.length === 0) {
    if (blocked) {
      return;
    }

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

  refreshPriceRange(insight, verified[0]?.currency ?? insight.priceRange.currency);
}

function refreshPriceRange(insight: CompetitorInsight, currency?: string | null) {
  const amounts = insight.prices
    .map((row) => row.price)
    .filter((value): value is number => value !== null);
  if (amounts.length === 0) {
    return;
  }

  const sorted = [...amounts].sort((left, right) => left - right);
  insight.priceRange = {
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    typical: sorted[Math.floor(sorted.length / 2)] ?? null,
    currency: currency || insight.priceRange.currency || "TRY",
  };
}

function mergePriceLists(...lists: CompetitorPrice[][]) {
  const seen = new Set<string>();
  const merged: CompetitorPrice[] = [];

  for (const list of lists) {
    for (const row of list) {
      if (isSearchEngineHost(row.url)) {
        continue;
      }

      const key = `${hostOf(row.url)}|${row.seller}|${row.price ?? "x"}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(row);
    }
  }

  return merged.slice(0, 16);
}

function emptySiteEvidence(note: string): SiteEvidence {
  return {
    pages: [],
    prices: [],
    note,
    search: null,
    searchUrl: null,
    blocked: false,
  };
}

export async function analyzeCompetitorWatch(id: string) {
  const watch = await prisma.competitorWatch.findUnique({
    where: { id },
  });

  if (!watch) {
    throw new Error("Takip kaydı bulunamadı.");
  }

  const query = watch.query || watch.name;
  const engines = parseSearchEngines(watch.searchEngines);
  const shopWebsite = isSearchEngineHost(watch.website) ? null : watch.website;
  const shopTemplate = isSearchEngineHost(watch.searchTemplate)
    ? null
    : watch.searchTemplate;
  const shouldScrapeShop = Boolean(shopWebsite || shopTemplate);

  const [library, ownProducts, fetched, market] = await Promise.all([
    searchAdLibrary({
      query,
      country: watch.country,
      pageId: watch.pageId,
    }),
    listOwnProductHints(),
    shouldScrapeShop
      ? collectSitePrices({
          website: shopWebsite,
          searchTemplate: shopTemplate,
          query,
          sellerName: watch.name,
        })
      : Promise.resolve(
          emptySiteEvidence(
            "Mağaza adresi yok veya arama motoru girildi; fiyatlar arama motoru taramasından alınacak.",
          ),
        ),
    collectMarketPrices({
      query,
      country: watch.country,
      engines,
    }),
  ]);
  const siteEvidence = shouldScrapeShop
    ? await fillMissingSitePrices(fetched, {
        query,
        sellerName: watch.name,
        country: watch.country,
      })
    : fetched;

  const result = await completeWebResearch(
    RESEARCH_PROMPT,
    JSON.stringify({
      task: "Arama motorlarında pazar fiyat taraması",
      watch: {
        kind: watch.kind,
        name: watch.name,
        query: watch.query,
        website: shopWebsite,
        searchTemplate: shopTemplate,
        searchEngines: engines,
        pageId: watch.pageId,
        country: watch.country,
        notes: watch.notes,
      },
      marketEvidence: market,
      siteEvidence: {
        ...siteEvidence,
        pages: siteEvidence.pages.map((page) => ({
          title: page.title,
          status: page.status,
        })),
      },
      ownTopProducts: ownProducts.slice(0, 8),
      officialAdLibrary: library.hits.slice(0, 10),
      libraryNote: library.note,
    }),
    watch.country,
    ["web_search", "visit_website"],
  );

  const insight = parseInsight(
    result.data,
    result.model,
    [library.note, market.note, siteEvidence.note].filter(Boolean).join(" "),
  );
  applyVerifiedPrices(
    insight,
    siteEvidence.prices,
    watch.name,
    shopWebsite,
    siteEvidence.blocked,
  );
  insight.prices = mergePriceLists(
    siteEvidence.prices.map((price) => ({
      seller: watch.name,
      product: price.product,
      price: price.amount,
      currency: price.currency,
      url: price.url,
      note: "Kaynak siteden anlık okundu.",
      verified: true,
    })),
    market.prices,
    insight.prices,
  );
  refreshPriceRange(
    insight,
    siteEvidence.prices[0]?.currency ??
      market.prices[0]?.currency ??
      insight.priceRange.currency,
  );

  for (const price of [...siteEvidence.prices, ...market.prices]) {
    const url = price.url;
    if (!url || insight.sources.some((source) => source.url === url)) {
      continue;
    }
    insight.sources.unshift({
      title: price.product || watch.name,
      url,
    });
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
