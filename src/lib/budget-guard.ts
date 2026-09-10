import {
  BudgetAlertKind,
  BudgetAlertSeverity,
  SalesScope,
} from "@prisma/client";
import {
  DEFAULT_BUDGET_GUARD,
  type AdSetGuardDecision,
  type BudgetAlertKind as AlertKind,
  type BudgetGuardAlertView,
  type BudgetGuardSettingsView,
} from "@/lib/budget-guard-types";
import { addDays, fromYmd, toYmd } from "@/lib/date-range";
import { pauseMetaAdSet } from "@/lib/meta-mutate";
import { prisma } from "@/lib/prisma";

type DailyPoint = {
  date: string;
  purchases: number;
  purchaseValue: number;
};

type AdSetSignal = {
  metaId: string;
  name: string;
  effectiveStatus: string | null;
  startTime: Date | null;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  purchases: number;
  purchaseValue: number;
  daily: DailyPoint[];
};

type ProductSignal = {
  productId: string;
  name: string | null;
  purchases: number;
};

type Verdict = {
  kind: BudgetAlertKind;
  severity: BudgetAlertSeverity;
  metaAdSetId: string;
  adSetName: string;
  productId: string;
  productName: string | null;
  title: string;
  message: string;
  recommendation: string;
  spend: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ctr: number;
};

type Diagnosis = {
  decision: AdSetGuardDecision;
  verdict: Verdict | null;
};

function toNumber(value?: string | number | null) {
  const amount = Number(value);
  return Number.isNaN(amount) ? 0 : amount;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function liveDaysSince(start: Date | null, today = new Date()) {
  if (!start) {
    return null;
  }

  const from = fromYmd(toYmd(start));
  const to = fromYmd(toYmd(today));
  const diff = Math.round((to.getTime() - from.getTime()) / 86_400_000);

  return Math.max(1, diff + 1);
}

function sumPurchases(points: DailyPoint[], fromDate?: string, toDate?: string) {
  return points.reduce((sum, point) => {
    if (fromDate && point.date < fromDate) {
      return sum;
    }

    if (toDate && point.date > toDate) {
      return sum;
    }

    return sum + point.purchases;
  }, 0);
}

function recentPurchases(points: DailyPoint[], days: number) {
  const from = toYmd(addDays(new Date(), -(days - 1)));
  return sumPurchases(points, from);
}

export function toBudgetGuardSettingsView(
  row: {
    enabled: boolean;
    maxProductSales: number;
    maxAdSetSpend: number;
    minClicksToJudge: number;
    minImpressionsToJudge: number;
    highCtrPercent: number;
    earlyWarningRatio: number;
    minRoasToKeep: number;
    firstReviewDays: number;
    hardCloseDays: number;
    minSalesToKeep: number;
    extraSalesToConfirm: number;
    updatedAt: Date;
  } | null,
): BudgetGuardSettingsView {
  if (!row) {
    return DEFAULT_BUDGET_GUARD;
  }

  return {
    enabled: row.enabled,
    maxProductSales: row.maxProductSales,
    maxAdSetSpend: row.maxAdSetSpend,
    minClicksToJudge: row.minClicksToJudge,
    minImpressionsToJudge: row.minImpressionsToJudge,
    highCtrPercent: row.highCtrPercent,
    earlyWarningRatio: row.earlyWarningRatio,
    minRoasToKeep: row.minRoasToKeep,
    firstReviewDays: row.firstReviewDays,
    hardCloseDays: row.hardCloseDays,
    minSalesToKeep: row.minSalesToKeep,
    extraSalesToConfirm: row.extraSalesToConfirm,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getBudgetGuardSettings() {
  const row = await prisma.budgetGuardSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  return toBudgetGuardSettingsView(row);
}

function hasBuyerInterest(
  signal: AdSetSignal,
  settings: BudgetGuardSettingsView,
) {
  const enoughClicks = signal.clicks >= settings.minClicksToJudge;
  const enoughReach = signal.impressions >= settings.minImpressionsToJudge;
  const highCtr = signal.ctr >= settings.highCtrPercent;

  return enoughClicks && (enoughReach || highCtr);
}

function closeVerdict(
  signal: AdSetSignal,
  kind: BudgetAlertKind,
  title: string,
  message: string,
  recommendation: string,
): Verdict {
  return {
    kind,
    severity: BudgetAlertSeverity.CRITICAL,
    metaAdSetId: signal.metaId,
    adSetName: signal.name,
    productId: "",
    productName: null,
    title,
    message,
    recommendation,
    spend: signal.spend,
    purchases: signal.purchases,
    clicks: signal.clicks,
    impressions: signal.impressions,
    ctr: signal.ctr,
  };
}

function decisionOf(
  signal: AdSetSignal,
  action: AdSetGuardDecision["action"],
  label: string,
  detail: string,
  liveDays: number | null,
  kind: AlertKind | null = null,
): AdSetGuardDecision {
  return {
    metaAdSetId: signal.metaId,
    action,
    label,
    detail,
    liveDays,
    kind,
  };
}

function diagnoseAdSet(
  signal: AdSetSignal,
  settings: BudgetGuardSettingsView,
): Diagnosis {
  const liveDays = liveDaysSince(signal.startTime);
  const startYmd = signal.startTime ? toYmd(signal.startTime) : null;
  const sales = startYmd
    ? sumPurchases(signal.daily, startYmd) || signal.purchases
    : signal.purchases;
  const firstReviewDate =
    startYmd && settings.firstReviewDays > 0
      ? toYmd(addDays(fromYmd(startYmd), settings.firstReviewDays - 1))
      : null;
  const salesAfterReview =
    firstReviewDate && startYmd
      ? sumPurchases(signal.daily, toYmd(addDays(fromYmd(firstReviewDate), 1)))
      : 0;
  const recentSales = recentPurchases(signal.daily, 2);
  const interest = hasBuyerInterest(signal, settings);
  const cap = settings.maxAdSetSpend;
  const hitCap = cap > 0 && signal.spend + 1e-9 >= cap;
  const nearCap =
    cap > 0 &&
    !hitCap &&
    signal.spend >= cap * settings.earlyWarningRatio;
  const healthySales = sales >= settings.minSalesToKeep + settings.extraSalesToConfirm;
  const dayLabel = liveDays ? `${liveDays}. gün` : "gün bilinmiyor";
  const statsLabel = `${dayLabel} · ${sales} satış · ${formatAmount(signal.spend)} harcama`;

  if (signal.effectiveStatus !== "ACTIVE") {
    return {
      decision: decisionOf(signal, "KEEP", "Kapalı", statsLabel, liveDays),
      verdict: null,
    };
  }

  if (hitCap && sales === 0) {
    if (interest) {
      return {
        decision: decisionOf(
          signal,
          "CLOSE",
          "Kapat",
          `${statsLabel}. İlgi var ama satış yok; fiyat pahalı.`,
          liveDays,
          "PRICE_TOO_HIGH",
        ),
        verdict: closeVerdict(
          signal,
          BudgetAlertKind.PRICE_TOO_HIGH,
          "İlgi var, satış yok — fiyat pahalı olabilir",
          `${signal.name} ${statsLabel}. ${formatAmount(signal.impressions)} gösterim, ${signal.clicks} tıklama, CTR %${formatAmount(signal.ctr)}. Ürün bakılmış ama alınmamış.`,
          "Reklam setini kapatın. Fiyat veya teklifi düşürmeden tekrar açmayın.",
        ),
      };
    }

    return {
      decision: decisionOf(
        signal,
        "CLOSE",
        "Kapat",
        `${statsLabel}. İlgi de satış da yok.`,
        liveDays,
        "NO_INTEREST",
      ),
      verdict: closeVerdict(
        signal,
        BudgetAlertKind.NO_INTEREST,
        "Limit doldu, satış gelmedi",
        `${signal.name} ${statsLabel}. Gösterim ${formatAmount(signal.impressions)}, tıklama ${signal.clicks}.`,
        "Reklam setini kapatın. Kreatif veya kitle tutmamış.",
      ),
    };
  }

  if (hitCap && sales > 0 && signal.purchaseValue > 0) {
    const roas = signal.purchaseValue / signal.spend;

    if (roas < settings.minRoasToKeep) {
      return {
        decision: decisionOf(
          signal,
          "CLOSE",
          "Kapat",
          `${statsLabel}. ROAS ${formatAmount(roas)}, hedef ${formatAmount(settings.minRoasToKeep)}.`,
          liveDays,
          "WEAK_ROAS",
        ),
        verdict: closeVerdict(
          signal,
          BudgetAlertKind.WEAK_ROAS,
          "Satış var ama para geri dönmüyor",
          `${signal.name} ${statsLabel}. ROAS ${formatAmount(roas)}.`,
          "Reklam setini kapatın. Satış kalitesiz, bütçeyi büyütmeyin.",
        ),
      };
    }
  }

  if (liveDays !== null && liveDays < settings.firstReviewDays) {
    if (nearCap && sales === 0) {
      return {
        decision: decisionOf(
          signal,
          "WATCH",
          "Süre ver",
          `${statsLabel}. İlk kontrol ${settings.firstReviewDays}. günde. Limit yaklaşıyor.`,
          liveDays,
        ),
        verdict: null,
      };
    }

    return {
      decision: decisionOf(
        signal,
        "KEEP",
        "Devam",
        `${statsLabel}. İlk kontrole ${settings.firstReviewDays - liveDays} gün var.`,
        liveDays,
      ),
      verdict: null,
    };
  }

  if (
    liveDays !== null &&
    liveDays >= settings.firstReviewDays &&
    liveDays < settings.hardCloseDays
  ) {
    if (sales === 0 && !interest) {
      return {
        decision: decisionOf(
          signal,
          "CLOSE",
          "Kapat",
          `${statsLabel}. İlk kontrol geçti, ne satış ne ilgi var.`,
          liveDays,
          "NO_INTEREST",
        ),
        verdict: closeVerdict(
          signal,
          BudgetAlertKind.NO_INTEREST,
          "İlk kontrol: satış ve ilgi yok",
          `${signal.name} ${statsLabel}. ${settings.firstReviewDays} gün içinde dönüşüm gelmedi.`,
          "Reklam setini kapatın. Daha fazla gün beklemeyin.",
        ),
      };
    }

    if (sales === 0 && interest) {
      return {
        decision: decisionOf(
          signal,
          "WATCH",
          "Süre ver",
          `${statsLabel}. Tıklama yüksek; son karar ${settings.hardCloseDays}. günde.`,
          liveDays,
        ),
        verdict: null,
      };
    }

    if (sales >= settings.minSalesToKeep) {
      return {
        decision: decisionOf(
          signal,
          "KEEP",
          "Devam",
          `${statsLabel}. Satma sinyali var, set açık kalsın.`,
          liveDays,
        ),
        verdict: null,
      };
    }

    return {
      decision: decisionOf(
        signal,
        "WATCH",
        "Süre ver",
        `${statsLabel}. Zayıf sinyal; ${settings.hardCloseDays}. güne kadar izle.`,
        liveDays,
      ),
      verdict: null,
    };
  }

  if (liveDays !== null && liveDays >= settings.hardCloseDays) {
    if (sales === 0) {
      const kind = interest
        ? BudgetAlertKind.PRICE_TOO_HIGH
        : BudgetAlertKind.NO_INTEREST;

      return {
        decision: decisionOf(
          signal,
          "CLOSE",
          "Kapat",
          `${statsLabel}. ${settings.hardCloseDays} gün doldu, satış yok.`,
          liveDays,
          interest ? "PRICE_TOO_HIGH" : "NO_INTEREST",
        ),
        verdict: closeVerdict(
          signal,
          kind,
          interest
            ? "Süre doldu: ilgi var, satış yok"
            : "Süre doldu: satış gelmedi",
          `${signal.name} ${statsLabel}. Son karar günü geçti.`,
          "Reklam setini kapatın.",
        ),
      };
    }

    if (healthySales || recentSales > 0) {
      return {
        decision: decisionOf(
          signal,
          "KEEP",
          "Devam",
          recentSales > 0 && !healthySales
            ? `${statsLabel}. Son günlerde yeni satış geldi, devam.`
            : `${statsLabel}. Satış büyüyor, kampanya açık kalsın.`,
          liveDays,
        ),
        verdict: null,
      };
    }

    if (
      sales >= settings.minSalesToKeep &&
      salesAfterReview < settings.extraSalesToConfirm
    ) {
      return {
        decision: decisionOf(
          signal,
          "CLOSE",
          "Kapat",
          `${statsLabel}. İlk satıştan sonra ek satış gelmedi.`,
          liveDays,
          "STALE_SALES",
        ),
        verdict: closeVerdict(
          signal,
          BudgetAlertKind.STALE_SALES,
          "Satış durdu — seti kapatın",
          `${signal.name} ${statsLabel}. İlk kontrolde satış vardı ama ${settings.hardCloseDays}. güne kadar yeni satış gelmedi.`,
          "Reklam setini kapatın. Tek satış tesadüf olabilir; bütçeyi uzatmayın.",
        ),
      };
    }
  }

  return {
    decision: decisionOf(signal, "KEEP", "Devam", statsLabel, liveDays),
    verdict: null,
  };
}

function diagnoseProducts(
  products: ProductSignal[],
  adSets: AdSetSignal[],
  settings: BudgetGuardSettingsView,
): Diagnosis[] {
  if (settings.maxProductSales <= 0) {
    return [];
  }

  const host = adSets.find((item) => item.effectiveStatus === "ACTIVE");

  if (!host) {
    return [];
  }

  return products
    .filter((product) => product.purchases >= settings.maxProductSales)
    .map((product) => {
      const verdict: Verdict = {
        kind: BudgetAlertKind.PRODUCT_CAP,
        severity: BudgetAlertSeverity.CRITICAL,
        metaAdSetId: host.metaId,
        adSetName: host.name,
        productId: product.productId,
        productName: product.name,
        title: "Ürün satış tavanına ulaştı",
        message: `${product.name ?? product.productId} ${product.purchases} adet sattı. Tavan ${settings.maxProductSales}.`,
        recommendation:
          "Bu ürüne bağlı reklam setini kapatın. Stok ve marjı kontrol edin.",
        spend: host.spend,
        purchases: product.purchases,
        clicks: host.clicks,
        impressions: host.impressions,
        ctr: host.ctr,
      };

      return {
        decision: decisionOf(
          host,
          "CLOSE",
          "Kapat",
          `${product.name ?? product.productId} tavanı doldurdu.`,
          liveDaysSince(host.startTime),
          "PRODUCT_CAP",
        ),
        verdict,
      };
    });
}

async function loadPurchaseValues(
  campaignMetaId: string,
  since: string,
  until: string,
) {
  const rows = await prisma.salesDailyStat.findMany({
    where: {
      scope: SalesScope.ADSET,
      parentMetaId: campaignMetaId,
      date: { gte: since, lte: until },
    },
    select: {
      metaId: true,
      purchaseValue: true,
    },
  });

  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.metaId, (totals.get(row.metaId) ?? 0) + toNumber(row.purchaseValue));
  }

  return totals;
}

async function loadAdSetDaily(campaignMetaId: string, metaIds: string[]) {
  if (metaIds.length === 0) {
    return new Map<string, DailyPoint[]>();
  }

  const rows = await prisma.salesDailyStat.findMany({
    where: {
      scope: SalesScope.ADSET,
      parentMetaId: campaignMetaId,
      metaId: { in: metaIds },
    },
    select: {
      metaId: true,
      date: true,
      purchases: true,
      purchaseValue: true,
    },
    orderBy: { date: "asc" },
  });

  const grouped = new Map<string, DailyPoint[]>();

  for (const row of rows) {
    const list = grouped.get(row.metaId) ?? [];
    list.push({
      date: row.date,
      purchases: row.purchases,
      purchaseValue: toNumber(row.purchaseValue),
    });
    grouped.set(row.metaId, list);
  }

  return grouped;
}

function uniqueProductSignals(
  rows: Array<{ productId: string; name: string | null; purchases: number }>,
) {
  const best = new Map<string, ProductSignal>();

  for (const row of rows) {
    const current = best.get(row.productId);

    if (!current || row.purchases > current.purchases) {
      best.set(row.productId, {
        productId: row.productId,
        name: row.name,
        purchases: row.purchases,
      });
    }
  }

  return [...best.values()];
}

async function loadCappedProducts(
  campaignMetaId: string,
  since: string,
  until: string,
  maxProductSales: number,
) {
  const windowRows = await prisma.salesProductStat.findMany({
    where: {
      scope: SalesScope.CAMPAIGN,
      parentMetaId: campaignMetaId,
      windowSince: since,
      windowUntil: until,
      purchases: { gte: maxProductSales },
    },
    orderBy: { purchases: "desc" },
  });

  if (windowRows.length > 0) {
    return uniqueProductSignals(windowRows);
  }

  const fallbackRows = await prisma.salesProductStat.findMany({
    where: {
      scope: SalesScope.CAMPAIGN,
      parentMetaId: campaignMetaId,
      purchases: { gte: maxProductSales },
    },
    orderBy: { purchases: "desc" },
  });

  return uniqueProductSignals(fallbackRows);
}

function verdictKey(verdict: Pick<Verdict, "kind" | "metaAdSetId" | "productId">) {
  return `${verdict.kind}:${verdict.metaAdSetId}:${verdict.productId}`;
}

async function persistVerdicts(input: {
  campaignId: string;
  campaignMetaId: string;
  adSetMetaIds: string[];
  verdicts: Verdict[];
}): Promise<BudgetGuardAlertView[]> {
  const existing = await prisma.budgetGuardAlert.findMany({
    where: {
      resolvedAt: null,
      OR: [
        { metaAdSetId: { in: input.adSetMetaIds } },
        {
          campaignMetaId: input.campaignMetaId,
          kind: BudgetAlertKind.PRODUCT_CAP,
        },
      ],
    },
  });

  const currentKeys = new Set(input.verdicts.map(verdictKey));
  const now = new Date();

  const staleIds = existing
    .filter((row) => !currentKeys.has(verdictKey(row)))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    await prisma.budgetGuardAlert.updateMany({
      where: { id: { in: staleIds } },
      data: { resolvedAt: now },
    });
  }

  if (input.verdicts.length === 0) {
    return [];
  }

  const existingByKey = new Map(
    (
      await prisma.budgetGuardAlert.findMany({
        where: {
          OR: input.verdicts.map((verdict) => ({
            kind: verdict.kind,
            metaAdSetId: verdict.metaAdSetId,
            productId: verdict.productId,
          })),
        },
      })
    ).map((row) => [verdictKey(row), row]),
  );

  const saved: BudgetGuardAlertView[] = [];

  for (const verdict of input.verdicts) {
    const previous = existingByKey.get(verdictKey(verdict));
    const reopened = Boolean(previous?.resolvedAt);
    const row = await prisma.budgetGuardAlert.upsert({
      where: {
        kind_metaAdSetId_productId: {
          kind: verdict.kind,
          metaAdSetId: verdict.metaAdSetId,
          productId: verdict.productId,
        },
      },
      create: {
        ...verdict,
        campaignId: input.campaignId,
        campaignMetaId: input.campaignMetaId,
      },
      update: {
        ...verdict,
        campaignId: input.campaignId,
        campaignMetaId: input.campaignMetaId,
        resolvedAt: null,
        acknowledgedAt: reopened ? null : previous?.acknowledgedAt ?? null,
      },
    });

    saved.push(toAlertView(row, null));
  }

  return saved.filter((alert) => !alert.acknowledged);
}

function toAlertView(
  row: {
    id: string;
    kind: BudgetAlertKind;
    severity: BudgetAlertSeverity;
    metaAdSetId: string;
    adSetName: string;
    campaignId: string | null;
    campaignMetaId: string | null;
    productId: string;
    productName: string | null;
    title: string;
    message: string;
    recommendation: string;
    spend: number;
    purchases: number;
    clicks: number;
    impressions: number;
    ctr: number;
    acknowledgedAt: Date | null;
  },
  accountId: string | null,
): BudgetGuardAlertView {
  return {
    id: row.id,
    kind: row.kind as AlertKind,
    severity: row.severity,
    metaAdSetId: row.metaAdSetId,
    adSetName: row.adSetName,
    campaignId: row.campaignId,
    campaignMetaId: row.campaignMetaId,
    accountId,
    productId: row.productId || null,
    productName: row.productName,
    title: row.title,
    message: row.message,
    recommendation: row.recommendation,
    spend: row.spend,
    purchases: row.purchases,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    acknowledged: Boolean(row.acknowledgedAt),
  };
}

export async function evaluateAdSetGuards(input: {
  campaignId: string;
  campaignMetaId: string;
  since?: string;
  until?: string;
  adSets: Array<{
    metaId: string;
    name: string;
    effectiveStatus: string | null;
    startTime?: string | Date | null;
    spend: string | null;
    clicks: string | null;
    impressions: string | null;
    ctr: string | null;
    purchases: number;
  }>;
  persist?: boolean;
}): Promise<{
  alerts: BudgetGuardAlertView[];
  decisions: AdSetGuardDecision[];
}> {
  const settings = await getBudgetGuardSettings();

  if (!settings.enabled || input.adSets.length === 0) {
    return { alerts: [], decisions: [] };
  }

  const [valueMap, dailyMap] = await Promise.all([
    input.since && input.until
      ? loadPurchaseValues(input.campaignMetaId, input.since, input.until)
      : Promise.resolve(new Map<string, number>()),
    loadAdSetDaily(
      input.campaignMetaId,
      input.adSets.map((item) => item.metaId),
    ),
  ]);

  const signals: AdSetSignal[] = input.adSets.map((item) => ({
    metaId: item.metaId,
    name: item.name,
    effectiveStatus: item.effectiveStatus,
    startTime: item.startTime ? new Date(item.startTime) : null,
    spend: round(toNumber(item.spend)),
    clicks: Math.round(toNumber(item.clicks)),
    impressions: Math.round(toNumber(item.impressions)),
    ctr: round(toNumber(item.ctr)),
    purchases: item.purchases,
    purchaseValue: valueMap.get(item.metaId) ?? 0,
    daily: dailyMap.get(item.metaId) ?? [],
  }));

  const products =
    input.since && input.until
      ? await loadCappedProducts(
          input.campaignMetaId,
          input.since,
          input.until,
          settings.maxProductSales,
        )
      : [];

  const diagnoses = signals.map((signal) => diagnoseAdSet(signal, settings));
  const productDiagnoses = diagnoseProducts(products, signals, settings);

  const byMetaId = new Map(diagnoses.map((item) => [item.decision.metaAdSetId, item]));

  for (const extra of productDiagnoses) {
    const current = byMetaId.get(extra.decision.metaAdSetId);

    if (current?.decision.action === "KEEP") {
      continue;
    }

    if (!current || current.decision.action !== "CLOSE") {
      byMetaId.set(extra.decision.metaAdSetId, extra);
    }
  }

  const merged = [...byMetaId.values()];
  const verdicts = merged
    .map((item) => item.verdict)
    .filter((item): item is Verdict => Boolean(item));

  const alerts =
    input.persist === false
      ? []
      : await persistVerdicts({
          campaignId: input.campaignId,
          campaignMetaId: input.campaignMetaId,
          adSetMetaIds: signals.map((item) => item.metaId),
          verdicts,
        });

  return {
    alerts,
    decisions: merged.map((item) => item.decision),
  };
}

export async function listOpenBudgetAlerts(): Promise<BudgetGuardAlertView[]> {
  const rows = await prisma.budgetGuardAlert.findMany({
    where: {
      resolvedAt: null,
      acknowledgedAt: null,
    },
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
    take: 40,
  });

  const campaignIds = [
    ...new Set(
      rows
        .map((row) => row.campaignId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const campaigns = campaignIds.length
    ? await prisma.metaCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, accountId: true },
      })
    : [];
  const accountByCampaign = new Map(
    campaigns.map((campaign) => [campaign.id, campaign.accountId]),
  );

  return rows.map((row) =>
    toAlertView(row, row.campaignId ? accountByCampaign.get(row.campaignId) ?? null : null),
  );
}

export async function acknowledgeBudgetAlert(id: string) {
  return prisma.budgetGuardAlert.update({
    where: { id },
    data: { acknowledgedAt: new Date() },
  });
}

export async function pauseGuardedAdSet(adSetId: string, userId: string) {
  const adSet = await prisma.metaAdSet.findUnique({
    where: { id: adSetId },
    select: {
      id: true,
      name: true,
      metaAdSetId: true,
      effectiveStatus: true,
    },
  });

  if (!adSet) {
    throw new Error("Reklam seti bulunamadı.");
  }

  await pauseMetaAdSet(adSet.metaAdSetId);

  const updated = await prisma.metaAdSet.update({
    where: { id: adSet.id },
    data: {
      status: "PAUSED",
      effectiveStatus: "PAUSED",
    },
  });

  await prisma.budgetGuardAlert.updateMany({
    where: {
      metaAdSetId: adSet.metaAdSetId,
      resolvedAt: null,
    },
    data: {
      resolvedAt: new Date(),
      acknowledgedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "adset.pause",
      entity: "meta_ad_set",
      details: `${adSet.metaAdSetId} ${adSet.name}`,
    },
  });

  return updated;
}
