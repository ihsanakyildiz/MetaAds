export type SalesTrend = "UP" | "DOWN" | "STABLE";

export type SalesDay = {
  date: string;
  weekday: string;
  purchases: number;
  purchaseValue: number;
  spend: number;
  clicks: number;
  impressions: number;
};

export type SalesAnalysis = {
  sellProbability: number;
  previousProbability: number | null;
  probabilityDelta: number | null;
  conversionRate: number;
  hitRate: number;
  consistency: number;
  salesDays: number;
  activeDays: number;
  totalPurchases: number;
  totalValue: number;
  avgDailyPurchases: number;
  peakPurchases: number;
  peakDate: string | null;
  trend: SalesTrend;
  lastAnalyzedAt: string;
};

export type SalesSeller = {
  metaId: string;
  scopeId: string | null;
  name: string;
  purchases: number;
  sellProbability: number | null;
};

export type SalesSlice = {
  key: string;
  label: string;
  purchases: number;
  purchaseValue: number;
  spend: number;
};

export type SalesProduct = {
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
  countries: SalesSlice[];
  genders: SalesSlice[];
  ages: SalesSlice[];
  geoIsProductSpecific: boolean;
};

export type SalesPayload = {
  days: SalesDay[];
  analysis: SalesAnalysis;
  sellers: SalesSeller[];
  products: SalesProduct[];
};
