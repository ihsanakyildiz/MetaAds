import type { AdSetGuardDecision } from "@/lib/budget-guard-types";
import type { DateRangePreset } from "@/lib/date-range";
import type { SalesAnalysis } from "@/lib/sales-types";

export type ChildFilters = {
  query?: string;
  status?: string;
  datePreset?: DateRangePreset;
  since?: string;
  until?: string;
};

export type ChildListItem = {
  id: string;
  name: string;
  metaId: string;
  effectiveStatus: string | null;
  extra: string | null;
  thumbnailUrl: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  ctr: string | null;
  purchases: number;
  startTime: string | null;
  decision: AdSetGuardDecision | null;
};

export type ChildStats = {
  count: number;
  activeCount: number;
  spend: number;
  clicks: number;
  impressions: number;
  avgCtr: number | null;
  purchases: number;
  sellProbability: number | null;
  previousProbability: number | null;
  probabilityDelta: number | null;
  salesDays: number;
  trend: SalesAnalysis["trend"] | null;
};
