export type Role = "ADMIN" | "ANALYST" | "ADVERTISER";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ACCOUNTS_VIEW: "accounts.view",
  CAMPAIGNS_VIEW: "campaigns.view",
  CAMPAIGNS_MANAGE: "campaigns.manage",
  REPORTS_VIEW: "reports.view",
  CREATIVES_VIEW: "creatives.view",
  CREATIVES_UPLOAD: "creatives.upload",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_META: "settings.meta",
  USERS_MANAGE: "users.manage",
  COMPETITORS_VIEW: "competitors.view",
  COMPETITORS_MANAGE: "competitors.manage",
  META_AD_LIBRARY: "meta.ad_library",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ACCOUNTS_VIEW,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.CREATIVES_VIEW,
    PERMISSIONS.CREATIVES_UPLOAD,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_META,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.COMPETITORS_VIEW,
    PERMISSIONS.COMPETITORS_MANAGE,
    PERMISSIONS.META_AD_LIBRARY,
  ],
  ANALYST: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ACCOUNTS_VIEW,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.CREATIVES_VIEW,
    PERMISSIONS.COMPETITORS_VIEW,
    PERMISSIONS.META_AD_LIBRARY,
  ],
  ADVERTISER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ACCOUNTS_VIEW,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.CREATIVES_VIEW,
  ],
};

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleLabel(role: Role) {
  switch (role) {
    case "ADMIN":
      return "Yönetici";
    case "ANALYST":
      return "Analist";
    case "ADVERTISER":
      return "Reklam Veren";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function roleDescription(role: Role) {
  switch (role) {
    case "ADMIN":
      return "Tüm ayarlar, kullanıcılar, rakip analizi, Meta reklam kütüphanesi, kreatif yükleme ve Meta köprüsü";
    case "ANALYST":
      return "Rapor, kreatif, rakip analizi, Meta reklam kütüphanesi ve hesap görüntüleme";
    case "ADVERTISER":
      return "Reklam hesapları, kampanya ve kreatif önerileri";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
