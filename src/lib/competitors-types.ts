import type { SearchEngineId } from "@/lib/search-engines-types";

export type CompetitorKind = "COMPANY" | "PRODUCT";

export type CompetitorPrice = {
  seller: string;
  product: string;
  price: number | null;
  currency: string | null;
  url: string | null;
  note: string;
  engine?: string | null;
  verified?: boolean;
};

export type CompetitorAdHit = {
  id?: string;
  platform: "facebook" | "instagram" | "meta" | "web";
  advertiser: string;
  pageId?: string | null;
  message: string;
  offer: string;
  url: string | null;
  active: boolean | null;
  platforms?: string[];
  languages?: string[];
  startTime?: string | null;
  stopTime?: string | null;
  coverage?: string;
  euReach?: number | null;
};

export type CompetitorSource = {
  title: string;
  url: string;
};

export type CompetitorInsight = {
  headline: string;
  summary: string;
  tone: "success" | "warning" | "accent" | "neutral";
  priceRange: {
    min: number | null;
    max: number | null;
    typical: number | null;
    currency: string | null;
  };
  prices: CompetitorPrice[];
  ads: CompetitorAdHit[];
  threats: string[];
  opportunities: string[];
  sources: CompetitorSource[];
  libraryNote: string;
  generatedAt: string;
  model: string;
};

export type CompetitorWatchView = {
  id: string;
  kind: CompetitorKind;
  name: string;
  query: string;
  website: string | null;
  searchTemplate: string | null;
  searchEngines: SearchEngineId[];
  pageId: string | null;
  country: string;
  notes: string | null;
  enabled: boolean;
  updatedAt: string;
  lastReport: CompetitorInsight | null;
};

export function competitorKindLabel(kind: CompetitorKind) {
  switch (kind) {
    case "COMPANY":
      return "Rakip firma";
    case "PRODUCT":
      return "Ürün";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
