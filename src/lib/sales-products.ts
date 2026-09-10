import { SalesBreakdownKind, SalesScope, SalesTrend } from "@prisma/client";
import {
  fetchMetaCampaignCatalogId,
  fetchMetaCatalogProductsByRetailerIds,
  fetchMetaInsightsBreakdown,
  fetchMetaProductsByIds,
  fetchMetaPurchasedProducts,
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
  parseInsightProductId,
  type MetaBreakdownInsight,
  type MetaCatalogProduct,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { extractPurchases, extractPurchaseValue } from "@/lib/sales-actions";
import type { SalesProduct, SalesSlice } from "@/lib/sales-types";

const STALE_MS = 10 * 60 * 1000;

type Credentials = {
  accessToken: string;
  graphVersion: string;
};

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function countryLabel(code: string) {
  try {
    return (
      new Intl.DisplayNames(["tr"], { type: "region" }).of(code.toUpperCase()) ??
      code
    );
  } catch {
    return code;
  }
}

function genderLabel(value: string) {
  switch (value) {
    case "male":
      return "Erkek";
    case "female":
      return "Kadın";
    case "unknown":
      return "Belirtilmemiş";
    default:
      return value;
  }
}

function sliceFromRows(
  rows: Array<{ key: string; purchases: number; purchaseValue: number; spend: number }>,
  labelFor: (key: string) => string,
): SalesSlice[] {
  return rows
    .filter((row) => row.purchases > 0)
    .sort((left, right) => right.purchases - left.purchases)
    .map((row) => ({
      key: row.key,
      label: labelFor(row.key),
      purchases: row.purchases,
      purchaseValue: row.purchaseValue,
      spend: row.spend,
    }));
}

async function metaCredentials(): Promise<Credentials | null> {
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

async function tryBreakdown(
  credentials: Credentials,
  objectId: string,
  level: "campaign" | "adset",
  range: { since: string; until: string },
  breakdowns: string[],
) {
  try {
    return await fetchMetaInsightsBreakdown(
      credentials.accessToken,
      objectId,
      level,
      range,
      breakdowns,
      credentials.graphVersion,
    );
  } catch {
    return null;
  }
}

function insightMetrics(insight: MetaBreakdownInsight) {
  return {
    purchases: extractPurchases(insight.actions),
    purchaseValue: extractPurchaseValue(insight.action_values),
    spend: toNumber(insight.spend),
    clicks: Math.round(toNumber(insight.clicks)),
    impressions: Math.round(toNumber(insight.impressions)),
  };
}

async function resolveProductDetails(
  credentials: Credentials,
  productIds: string[],
  catalogCampaignId: string,
) {
  const details = new Map<string, MetaCatalogProduct>();

  try {
    const byId = await fetchMetaProductsByIds(
      credentials.accessToken,
      productIds,
      credentials.graphVersion,
    );

    for (const [id, product] of byId) {
      details.set(id, product);
    }
  } catch {
    // Catalog lookup below fills missing names.
  }

  const missing = productIds.filter((id) => !details.get(id)?.name);

  if (missing.length === 0) {
    return details;
  }

  try {
    const catalogId = await fetchMetaCampaignCatalogId(
      credentials.accessToken,
      catalogCampaignId,
      credentials.graphVersion,
    );

    if (!catalogId) {
      return details;
    }

    const byRetailer = await fetchMetaCatalogProductsByRetailerIds(
      credentials.accessToken,
      catalogId,
      missing,
      credentials.graphVersion,
    );

    for (const id of missing) {
      const product = byRetailer.get(id);

      if (product) {
        details.set(id, product);
      }
    }
  } catch {
    return details;
  }

  return details;
}

async function persistProducts(
  scope: SalesScope,
  parentMetaId: string,
  window: { since: string; until: string },
  products: Array<{
    productId: string;
    retailerId: string | null;
    name: string | null;
    brand: string | null;
    imageUrl: string | null;
    productUrl: string | null;
    price: string | null;
    purchases: number;
    purchaseValue: number;
    spend: number;
    clicks: number;
    impressions: number;
  }>,
) {
  const now = new Date();

  await prisma.salesProductStat.deleteMany({
    where: {
      scope,
      parentMetaId,
      windowSince: window.since,
      windowUntil: window.until,
    },
  });

  if (products.length === 0) {
    return;
  }

  await prisma.salesProductStat.createMany({
    data: products.map((product) => ({
      scope,
      parentMetaId,
      productId: product.productId,
      retailerId: product.retailerId,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      price: product.price,
      purchases: product.purchases,
      purchaseValue: product.purchaseValue ? String(product.purchaseValue) : null,
      spend: String(product.spend),
      clicks: product.clicks,
      impressions: product.impressions,
      windowSince: window.since,
      windowUntil: window.until,
      syncedAt: now,
    })),
  });
}

async function persistBreakdowns(
  scope: SalesScope,
  parentMetaId: string,
  window: { since: string; until: string },
  rows: Array<{
    productId: string;
    kind: SalesBreakdownKind;
    key: string;
    purchases: number;
    purchaseValue: number;
    spend: number;
  }>,
) {
  const now = new Date();

  await prisma.salesBreakdownStat.deleteMany({
    where: {
      scope,
      parentMetaId,
      windowSince: window.since,
      windowUntil: window.until,
    },
  });

  if (rows.length === 0) {
    return;
  }

  await prisma.salesBreakdownStat.createMany({
    data: rows.map((row) => ({
      scope,
      parentMetaId,
      productId: row.productId,
      kind: row.kind,
      key: row.key,
      purchases: row.purchases,
      purchaseValue: row.purchaseValue ? String(row.purchaseValue) : null,
      spend: String(row.spend),
      windowSince: window.since,
      windowUntil: window.until,
      syncedAt: now,
    })),
  });
}

function breakdownRows(
  insights: MetaBreakdownInsight[] | null,
  kind: SalesBreakdownKind,
  keyOf: (insight: MetaBreakdownInsight) => string | undefined,
  perProduct: boolean,
) {
  if (!insights) {
    return [];
  }

  return insights.flatMap((insight) => {
    const key = keyOf(insight);
    const productId = perProduct ? insight.product_id : "";

    if (!key || (perProduct && !productId)) {
      return [];
    }

    const metrics = insightMetrics(insight);

    return [
      {
        productId: productId ?? "",
        kind,
        key,
        ...metrics,
      },
    ];
  });
}

async function isProductsFresh(
  scope: SalesScope,
  parentMetaId: string,
  window: { since: string; until: string },
) {
  const score = await prisma.salesScore.findUnique({
    where: {
      scope_metaId: { scope, metaId: parentMetaId },
    },
    select: {
      productsSyncedAt: true,
      windowSince: true,
      windowUntil: true,
    },
  });

  if (
    !score?.productsSyncedAt ||
    score.windowSince !== window.since ||
    score.windowUntil !== window.until
  ) {
    return false;
  }

  return Date.now() - score.productsSyncedAt.getTime() < STALE_MS;
}

async function markProductsSynced(
  scope: SalesScope,
  parentMetaId: string,
  window: { since: string; until: string },
) {
  const now = new Date();

  await prisma.salesScore.upsert({
    where: {
      scope_metaId: { scope, metaId: parentMetaId },
    },
    create: {
      scope,
      metaId: parentMetaId,
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
      productsSyncedAt: now,
      lastAnalyzedAt: now,
    },
    update: {
      windowSince: window.since,
      windowUntil: window.until,
      productsSyncedAt: now,
    },
  });
}

export async function syncSoldProducts(input: {
  scope: SalesScope;
  parentMetaId: string;
  objectId: string;
  level: "campaign" | "adset";
  catalogCampaignId: string;
  since: string;
  until: string;
}): Promise<SalesProduct[]> {
  const window = { since: input.since, until: input.until };
  const credentials = await metaCredentials();

  if (credentials && !(await isProductsFresh(input.scope, input.parentMetaId, window))) {
    try {
      const [productInsights, countryInsights, genderInsights, ageInsights] =
        await Promise.all([
          fetchMetaPurchasedProducts(
            credentials.accessToken,
            input.objectId,
            input.level,
            window,
            credentials.graphVersion,
            (insight) => extractPurchases(insight.actions) > 0,
          ),
          tryBreakdown(credentials, input.objectId, input.level, window, [
            "country",
          ]),
          tryBreakdown(credentials, input.objectId, input.level, window, [
            "gender",
          ]),
          tryBreakdown(credentials, input.objectId, input.level, window, [
            "age",
          ]),
        ]);

      const productMap = new Map<
        string,
        {
          productId: string;
          retailerId: string | null;
          name: string | null;
          purchases: number;
          purchaseValue: number;
          spend: number;
          clicks: number;
          impressions: number;
        }
      >();

      for (const insight of productInsights) {
        if (!insight.product_id) {
          continue;
        }

        const parsed = parseInsightProductId(insight.product_id);
        const metrics = insightMetrics(insight);
        const current = productMap.get(parsed.productId);

        productMap.set(parsed.productId, {
          productId: parsed.productId,
          retailerId: parsed.retailerId,
          name: current?.name ?? parsed.name,
          purchases: (current?.purchases ?? 0) + metrics.purchases,
          purchaseValue: (current?.purchaseValue ?? 0) + metrics.purchaseValue,
          spend: (current?.spend ?? 0) + metrics.spend,
          clicks: (current?.clicks ?? 0) + metrics.clicks,
          impressions: (current?.impressions ?? 0) + metrics.impressions,
        });
      }

      const sold = [...productMap.values()]
        .filter((product) => product.purchases > 0)
        .sort((left, right) => right.purchases - left.purchases)
        .slice(0, 40);

      const missingNames = sold
        .filter((product) => !product.name)
        .map((product) => product.productId);
      const catalog =
        missingNames.length > 0
          ? await resolveProductDetails(
              credentials,
              missingNames,
              input.catalogCampaignId,
            )
          : new Map<string, MetaCatalogProduct>();

      await persistProducts(
        input.scope,
        input.parentMetaId,
        window,
        sold.map((product) => {
          const detail = catalog.get(product.productId);

          return {
            ...product,
            retailerId: detail?.retailer_id ?? product.retailerId,
            name: product.name ?? detail?.name ?? null,
            brand: detail?.brand ?? null,
            imageUrl: detail?.image_url ?? null,
            productUrl: detail?.url ?? null,
            price: detail?.price
              ? detail.currency
                ? `${detail.price} ${detail.currency}`
                : detail.price
              : null,
          };
        }),
      );

      await persistBreakdowns(input.scope, input.parentMetaId, window, [
        ...breakdownRows(
          countryInsights,
          SalesBreakdownKind.COUNTRY,
          (insight) => insight.country,
          false,
        ),
        ...breakdownRows(
          genderInsights,
          SalesBreakdownKind.GENDER,
          (insight) => insight.gender,
          false,
        ),
        ...breakdownRows(
          ageInsights,
          SalesBreakdownKind.AGE,
          (insight) => insight.age,
          false,
        ),
      ]);

      await markProductsSynced(input.scope, input.parentMetaId, window);
    } catch {
      // Stored product history is used when Meta is unreachable.
    }
  }

  return readSoldProducts(input.scope, input.parentMetaId, window);
}

export async function readSoldProducts(
  scope: SalesScope,
  parentMetaId: string,
  window: { since: string; until: string },
): Promise<SalesProduct[]> {
  const [products, breakdowns] = await Promise.all([
    prisma.salesProductStat.findMany({
      where: {
        scope,
        parentMetaId,
        windowSince: window.since,
        windowUntil: window.until,
        purchases: { gt: 0 },
      },
      orderBy: { purchases: "desc" },
    }),
    prisma.salesBreakdownStat.findMany({
      where: {
        scope,
        parentMetaId,
        windowSince: window.since,
        windowUntil: window.until,
      },
    }),
  ]);

  const hasProductCountries = breakdowns.some(
    (row) => row.kind === SalesBreakdownKind.COUNTRY && row.productId,
  );
  const hasProductGenders = breakdowns.some(
    (row) => row.kind === SalesBreakdownKind.GENDER && row.productId,
  );
  const hasProductAges = breakdowns.some(
    (row) => row.kind === SalesBreakdownKind.AGE && row.productId,
  );

  function slicesFor(
    productId: string,
    kind: SalesBreakdownKind,
    perProduct: boolean,
    labelFor: (key: string) => string,
  ) {
    const rows = breakdowns.filter((row) => {
      if (row.kind !== kind) {
        return false;
      }

      return perProduct ? row.productId === productId : row.productId === "";
    });

    return sliceFromRows(
      rows.map((row) => ({
        key: row.key,
        purchases: row.purchases,
        purchaseValue: toNumber(row.purchaseValue),
        spend: toNumber(row.spend),
      })),
      labelFor,
    );
  }

  return products.map((product) => ({
    productId: product.productId,
    retailerId: product.retailerId,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    price: product.price,
    purchases: product.purchases,
    purchaseValue: toNumber(product.purchaseValue),
    spend: toNumber(product.spend),
    clicks: product.clicks,
    impressions: product.impressions,
    countries: slicesFor(
      product.productId,
      SalesBreakdownKind.COUNTRY,
      hasProductCountries,
      countryLabel,
    ),
    genders: slicesFor(
      product.productId,
      SalesBreakdownKind.GENDER,
      hasProductGenders,
      genderLabel,
    ),
    ages: slicesFor(
      product.productId,
      SalesBreakdownKind.AGE,
      hasProductAges,
      (key) => `${key} yaş`,
    ),
    geoIsProductSpecific: hasProductCountries,
  }));
}
