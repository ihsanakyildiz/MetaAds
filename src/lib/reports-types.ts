import type {
  AdSetGuardDecision,
  BudgetGuardAlertView,
} from "@/lib/budget-guard-types";
import type { SalesDay } from "@/lib/sales-types";

export type ReportTone = "danger" | "warning" | "success" | "accent";

export type ReportDiagnosis = {
  title: string;
  summary: string;
  tone: ReportTone;
};

export type ReportKpis = {
  spend: number;
  purchases: number;
  purchaseValue: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  roas: number | null;
  cpa: number | null;
  cvr: number | null;
  activeCampaigns: number;
  activeAdSets: number;
  closeCount: number;
  watchCount: number;
  scaleCount: number;
  wasteSpend: number;
};

export type ReportAdSetRow = {
  id: string;
  name: string;
  metaId: string;
  campaignId: string;
  campaignName: string;
  accountId: string;
  accountName: string;
  currency: string | null;
  status: string | null;
  liveDays: number | null;
  spend: number;
  purchases: number;
  purchaseValue: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpa: number | null;
  roas: number | null;
  sellProbability: number | null;
  decision: AdSetGuardDecision | null;
};

export type ReportCampaignRow = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  currency: string | null;
  status: string | null;
  spend: number;
  purchases: number;
  purchaseValue: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpa: number | null;
  roas: number | null;
  sellProbability: number | null;
  adSetCount: number;
  closeCount: number;
  watchCount: number;
};

export type ReportProductRow = {
  productId: string;
  name: string | null;
  purchases: number;
  purchaseValue: number;
  spend: number;
  clicks: number;
  impressions: number;
};

export type ReportPayload = {
  since: string;
  until: string;
  currency: string | null;
  mixedCurrency: boolean;
  diagnosis: ReportDiagnosis;
  kpis: ReportKpis;
  days: SalesDay[];
  close: ReportAdSetRow[];
  watch: ReportAdSetRow[];
  scale: ReportAdSetRow[];
  campaigns: ReportCampaignRow[];
  adSets: ReportAdSetRow[];
  products: ReportProductRow[];
  alerts: BudgetGuardAlertView[];
};
