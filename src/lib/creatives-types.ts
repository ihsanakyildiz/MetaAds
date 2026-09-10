export type CreativeKind = "IMAGE" | "VIDEO";
export type CreativeSource = "META" | "UPLOAD";
export type CreativeAction = "USE" | "TEST" | "AVOID";
export type CreativeConfidence = "HIGH" | "MEDIUM" | "LOW";

export type CreativeCard = {
  id: string;
  name: string;
  kind: CreativeKind;
  source: CreativeSource;
  previewUrl: string | null;
  headline: string | null;
  sellProbability: number;
  confidence: CreativeConfidence;
  action: CreativeAction;
  reasons: string[];
  adsCount: number;
  campaignsCount: number;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  purchases: number;
  currency: string | null;
  usedIn: string[];
};

export type CreativeBucket = {
  key: string;
  label: string;
  count: number;
};

export type CreativeKindStat = {
  kind: CreativeKind;
  count: number;
  avgProbability: number;
  purchases: number;
};

export type CreativesInsight = {
  tone: "success" | "warning" | "accent" | "neutral";
  title: string;
  detail: string;
};

export type CreativesPayload = {
  items: CreativeCard[];
  stats: {
    total: number;
    metaCount: number;
    uploadCount: number;
    imageCount: number;
    videoCount: number;
    avgProbability: number | null;
    bestProbability: number | null;
    useCount: number;
    testCount: number;
    avoidCount: number;
    totalPurchases: number;
  };
  insight: CreativesInsight;
  distribution: CreativeBucket[];
  kindStats: CreativeKindStat[];
  topBars: Array<{
    id: string;
    name: string;
    probability: number;
    kind: CreativeKind;
  }>;
};
