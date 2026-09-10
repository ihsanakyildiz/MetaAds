import type { BudgetGuardAlertView } from "@/lib/budget-guard-types";
import type { SalesDay } from "@/lib/sales-types";

export type DashboardRankRow = {
  id: string;
  name: string;
  href: string;
  subtitle: string;
  spend: number;
  purchases: number;
  clicks: number;
  ctr: number | null;
  sellProbability: number | null;
  currency: string | null;
};

export type DashboardAdRow = DashboardRankRow & {
  thumbnailUrl: string | null;
};

export type DashboardCreativeRow = {
  id: string;
  name: string;
  previewUrl: string | null;
  kind: "IMAGE" | "VIDEO";
  sellProbability: number;
  href: string;
};

export type DashboardKpis = {
  spend: number;
  purchases: number;
  purchaseValue: number;
  clicks: number;
  roas: number | null;
  cpa: number | null;
  campaignCount: number;
  adSetCount: number;
  adCount: number;
  activeCampaigns: number;
  avgSellProbability: number | null;
};

export type DashboardPayload = {
  since: string;
  until: string;
  currency: string | null;
  mixedCurrency: boolean;
  insight: {
    title: string;
    detail: string;
    tone: "success" | "warning" | "accent" | "neutral";
  };
  kpis: DashboardKpis;
  days: SalesDay[];
  topCampaigns: DashboardRankRow[];
  topAdSets: DashboardRankRow[];
  topAds: DashboardAdRow[];
  topCreatives: DashboardCreativeRow[];
  topProducts: Array<{
    name: string;
    purchases: number;
    spend: number;
  }>;
  alerts: BudgetGuardAlertView[];
};
