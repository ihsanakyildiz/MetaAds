export function accountStatusLabel(status?: number | null) {
  switch (status) {
    case 1:
      return "Aktif";
    case 2:
      return "Pasif";
    case 3:
      return "Ödeme bekleniyor";
    case 7:
      return "Risk incelemesi";
    case 9:
      return "Kısıtlı";
    case 100:
      return "Kapatıldı";
    case 101:
      return "Askıda";
    default:
      return "Bilinmiyor";
  }
}

export function isAccountHealthy(status?: number | null) {
  return status === 1;
}

export function campaignStatusLabel(status?: string | null) {
  switch (status) {
    case "ACTIVE":
      return "Aktif";
    case "PAUSED":
      return "Duraklatıldı";
    case "DELETED":
      return "Silindi";
    case "ARCHIVED":
      return "Arşiv";
    case "IN_PROCESS":
      return "İşleniyor";
    case "WITH_ISSUES":
      return "Sorunlu";
    case "CAMPAIGN_PAUSED":
      return "Kampanya duraklatıldı";
    case "ADSET_PAUSED":
      return "Reklam seti duraklatıldı";
    case "DISAPPROVED":
      return "Onaylanmadı";
    case "PENDING_REVIEW":
      return "İncelemede";
    case "PREAPPROVED":
      return "Ön onaylı";
    default:
      return status ?? "Bilinmiyor";
  }
}

export function campaignStatusTone(
  status?: string | null,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
    case "IN_PROCESS":
    case "PENDING_REVIEW":
    case "PREAPPROVED":
      return "warning";
    case "WITH_ISSUES":
    case "DELETED":
    case "DISAPPROVED":
      return "danger";
    case "ARCHIVED":
    case undefined:
    case null:
      return "neutral";
    default:
      return "neutral";
  }
}

export function campaignObjectiveLabel(objective?: string | null) {
  switch (objective) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "Satış";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "Trafik";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "Lead";
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
    case "PAGE_LIKES":
      return "Etkileşim";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "Farkındalık";
    case "OUTCOME_APP_PROMOTION":
    case "APP_INSTALLS":
      return "Uygulama";
    case "OUTCOME_LEADS_QUALITY":
      return "Kaliteli lead";
    case "MESSAGES":
      return "Mesaj";
    case "VIDEO_VIEWS":
      return "Video izleme";
    default:
      return objective ?? "—";
  }
}

export function optimizationGoalLabel(goal?: string | null) {
  switch (goal) {
    case "OFFSITE_CONVERSIONS":
    case "VALUE":
      return "Dönüşüm";
    case "LINK_CLICKS":
      return "Link tıklaması";
    case "LANDING_PAGE_VIEWS":
      return "Açılış sayfası";
    case "IMPRESSIONS":
    case "REACH":
      return "Erişim";
    case "THRUPLAY":
    case "VIDEO_VIEWS":
      return "Video";
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return "Lead";
    case "APP_INSTALLS":
      return "Kurulum";
    case "CONVERSATIONS":
    case "REPLIES":
      return "Mesaj";
    case "POST_ENGAGEMENT":
      return "Etkileşim";
    default:
      return goal ?? "—";
  }
}
