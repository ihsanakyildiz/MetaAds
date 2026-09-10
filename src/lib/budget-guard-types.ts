export type BudgetAlertKind =
  | "NO_INTEREST"
  | "PRICE_TOO_HIGH"
  | "EARLY_WATCH"
  | "PRODUCT_CAP"
  | "WEAK_ROAS"
  | "STALE_SALES";

export type BudgetAlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export type AdSetGuardAction = "CLOSE" | "WATCH" | "KEEP";

export type BudgetGuardSettingsView = {
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
  updatedAt: string | null;
};

export type AdSetGuardDecision = {
  metaAdSetId: string;
  action: AdSetGuardAction;
  label: string;
  detail: string;
  liveDays: number | null;
  kind: BudgetAlertKind | null;
};

export type BudgetGuardAlertView = {
  id: string;
  kind: BudgetAlertKind;
  severity: BudgetAlertSeverity;
  metaAdSetId: string;
  adSetName: string;
  campaignId: string | null;
  campaignMetaId: string | null;
  accountId: string | null;
  productId: string | null;
  productName: string | null;
  title: string;
  message: string;
  recommendation: string;
  spend: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ctr: number;
  acknowledged: boolean;
};

export const DEFAULT_BUDGET_GUARD: BudgetGuardSettingsView = {
  enabled: true,
  maxProductSales: 30,
  maxAdSetSpend: 5,
  minClicksToJudge: 8,
  minImpressionsToJudge: 400,
  highCtrPercent: 1.5,
  earlyWarningRatio: 0.7,
  minRoasToKeep: 1,
  firstReviewDays: 5,
  hardCloseDays: 7,
  minSalesToKeep: 1,
  extraSalesToConfirm: 1,
  updatedAt: null,
};

export function budgetAlertKindLabel(kind: BudgetAlertKind) {
  switch (kind) {
    case "NO_INTEREST":
      return "İlgi yok";
    case "PRICE_TOO_HIGH":
      return "Fiyat pahalı";
    case "EARLY_WATCH":
      return "Süre ver";
    case "PRODUCT_CAP":
      return "Ürün tavanı";
    case "WEAK_ROAS":
      return "Zayıf getiri";
    case "STALE_SALES":
      return "Satış durdu";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function budgetAlertSeverityTone(
  severity: BudgetAlertSeverity,
): "danger" | "warning" | "accent" {
  switch (severity) {
    case "CRITICAL":
      return "danger";
    case "WARNING":
      return "warning";
    case "INFO":
      return "accent";
    default: {
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

export function guardActionLabel(action: AdSetGuardAction) {
  switch (action) {
    case "CLOSE":
      return "Kapat";
    case "WATCH":
      return "Süre ver";
    case "KEEP":
      return "Devam";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function guardActionTone(
  action: AdSetGuardAction,
): "danger" | "warning" | "success" {
  switch (action) {
    case "CLOSE":
      return "danger";
    case "WATCH":
      return "warning";
    case "KEEP":
      return "success";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
