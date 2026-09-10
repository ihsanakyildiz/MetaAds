export const CAMPAIGN_OBJECTIVES = [
  { value: "OUTCOME_SALES", label: "Satış" },
  { value: "OUTCOME_TRAFFIC", label: "Trafik" },
  { value: "OUTCOME_LEADS", label: "Lead" },
  { value: "OUTCOME_ENGAGEMENT", label: "Etkileşim" },
  { value: "OUTCOME_AWARENESS", label: "Farkındalık" },
  { value: "OUTCOME_APP_PROMOTION", label: "Uygulama" },
] as const;

export const ENTITY_STATUSES = [
  { value: "PAUSED", label: "Duraklatıldı" },
  { value: "ACTIVE", label: "Aktif" },
] as const;

export const SPECIAL_AD_CATEGORIES = [
  { value: "NONE", label: "Yok" },
  { value: "HOUSING", label: "Konut" },
  { value: "EMPLOYMENT", label: "İstihdam" },
  { value: "CREDIT", label: "Kredi" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Siyaset / seçim" },
] as const;

export const OPTIMIZATION_GOALS = [
  { value: "OFFSITE_CONVERSIONS", label: "Dönüşüm" },
  { value: "VALUE", label: "Dönüşüm değeri" },
  { value: "LINK_CLICKS", label: "Link tıklaması" },
  { value: "LANDING_PAGE_VIEWS", label: "Açılış sayfası" },
  { value: "REACH", label: "Erişim" },
  { value: "IMPRESSIONS", label: "Gösterim" },
  { value: "POST_ENGAGEMENT", label: "Etkileşim" },
  { value: "LEAD_GENERATION", label: "Lead" },
  { value: "APP_INSTALLS", label: "Kurulum" },
] as const;

export const CUSTOM_EVENTS = [
  { value: "PURCHASE", label: "Satın alma" },
  { value: "ADD_TO_CART", label: "Sepete ekleme" },
  { value: "LEAD", label: "Lead" },
  { value: "COMPLETE_REGISTRATION", label: "Kayıt" },
  { value: "INITIATED_CHECKOUT", label: "Ödeme başlatma" },
  { value: "VIEW_CONTENT", label: "İçerik görüntüleme" },
] as const;

export const AD_CTAS = [
  { value: "LEARN_MORE", label: "Daha fazla bilgi" },
  { value: "SHOP_NOW", label: "Şimdi alışveriş yap" },
  { value: "SIGN_UP", label: "Kaydol" },
  { value: "SUBSCRIBE", label: "Abone ol" },
  { value: "CONTACT_US", label: "Bize ulaşın" },
  { value: "GET_OFFER", label: "Teklifi al" },
  { value: "APPLY_NOW", label: "Şimdi başvur" },
  { value: "BOOK_NOW", label: "Şimdi rezervasyon yap" },
  { value: "DOWNLOAD", label: "İndir" },
  { value: "GET_QUOTE", label: "Teklif al" },
] as const;

export const COUNTRY_OPTIONS = [
  { value: "TR", label: "Türkiye" },
  { value: "DE", label: "Almanya" },
  { value: "US", label: "ABD" },
  { value: "GB", label: "Birleşik Krallık" },
  { value: "FR", label: "Fransa" },
  { value: "NL", label: "Hollanda" },
  { value: "BE", label: "Belçika" },
  { value: "AT", label: "Avusturya" },
  { value: "CH", label: "İsviçre" },
  { value: "IT", label: "İtalya" },
  { value: "ES", label: "İspanya" },
  { value: "SE", label: "İsveç" },
  { value: "NO", label: "Norveç" },
  { value: "DK", label: "Danimarka" },
  { value: "FI", label: "Finlandiya" },
  { value: "PL", label: "Polonya" },
  { value: "RO", label: "Romanya" },
  { value: "BG", label: "Bulgaristan" },
  { value: "GR", label: "Yunanistan" },
  { value: "PT", label: "Portekiz" },
  { value: "AE", label: "BAE" },
  { value: "SA", label: "Suudi Arabistan" },
  { value: "AZ", label: "Azerbaycan" },
  { value: "KZ", label: "Kazakistan" },
] as const;

export type BudgetType = "none" | "daily" | "lifetime";

export function defaultOptimizationGoal(objective?: string | null) {
  switch (objective) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "OFFSITE_CONVERSIONS";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "LINK_CLICKS";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "OFFSITE_CONVERSIONS";
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
    case "PAGE_LIKES":
      return "POST_ENGAGEMENT";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "REACH";
    case "OUTCOME_APP_PROMOTION":
    case "APP_INSTALLS":
      return "APP_INSTALLS";
    default:
      return "LINK_CLICKS";
  }
}

export function needsConversionPixel(objective?: string | null) {
  return (
    objective === "OUTCOME_SALES" ||
    objective === "CONVERSIONS" ||
    objective === "PRODUCT_CATALOG_SALES" ||
    objective === "OUTCOME_LEADS" ||
    objective === "LEAD_GENERATION"
  );
}

export function toMetaMinorUnits(
  amount: number,
  currency?: string | null,
) {
  const zeroDecimal = new Set([
    "JPY",
    "KRW",
    "VND",
    "CLP",
    "ISK",
    "UGX",
    "PYG",
    "RWF",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);
  const rounded = zeroDecimal.has((currency ?? "").toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);

  return String(rounded);
}

export function fromMetaMinorUnits(
  value?: string | number | null,
  currency?: string | null,
) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return "";
  }

  const zeroDecimal = new Set([
    "JPY",
    "KRW",
    "VND",
    "CLP",
    "ISK",
    "UGX",
    "PYG",
    "RWF",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);

  const major = zeroDecimal.has((currency ?? "").toUpperCase())
    ? amount
    : amount / 100;

  return String(major);
}

export function parseCountryCodes(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code)),
    ),
  ];
}
