"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Images,
  LayoutDashboard,
  Megaphone,
  Settings,
  Shield,
  Layers3,
  Radar,
  WalletCards,
} from "lucide-react";
import {
  hasPermission,
  PERMISSIONS,
  roleLabel,
  type Role,
} from "@/lib/permissions";
import { persistSidebarState } from "@/lib/sidebar";

type SidebarProps = {
  user: {
    name: string;
    email: string;
    role: Role;
  };
  initialCollapsed?: boolean;
};

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    href: "/accounts",
    label: "Reklam Hesapları",
    icon: WalletCards,
    permission: PERMISSIONS.ACCOUNTS_VIEW,
  },
  {
    href: "/campaigns",
    label: "Kampanyalar",
    icon: Megaphone,
    permission: PERMISSIONS.CAMPAIGNS_VIEW,
  },
  {
    href: "/reports",
    label: "Raporlar",
    icon: BarChart3,
    permission: PERMISSIONS.REPORTS_VIEW,
  },
  {
    href: "/creatives",
    label: "Kreatif öneriler",
    icon: Images,
    permission: PERMISSIONS.CREATIVES_VIEW,
  },
  {
    href: "/competitors",
    label: "Rakip analizi",
    icon: Radar,
    permission: PERMISSIONS.COMPETITORS_VIEW,
  },
  {
    href: "/users",
    label: "Kullanıcılar",
    icon: Shield,
    permission: PERMISSIONS.USERS_MANAGE,
  },
  {
    href: "/settings",
    label: "Ayarlar",
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_VIEW,
  },
] as const;

export function Sidebar({ user, initialCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarState(next);
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col bg-sidebar text-white transition-[width] duration-200 ${
        collapsed ? "w-[80px]" : "w-[272px]"
      }`}
    >
      <div className={`px-3 pt-6 pb-4 ${collapsed ? "px-2" : "px-4"}`}>
        <div
          className={`flex items-center ${collapsed ? "flex-col gap-3" : "justify-between gap-3"}`}
        >
          <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent shadow-[0_8px_24px_rgba(24,119,242,0.35)]">
              <Layers3 className="h-5 w-5" />
            </div>
            {collapsed ? null : (
              <div>
                <p className="text-sm font-semibold tracking-wide">MetaAds</p>
                <p className="text-xs text-sidebar-muted">Intelligence Panel</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "Menüyü aç" : "Menüyü kapat"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        {collapsed ? null : (
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-muted">
            Yönetim
          </p>
        )}
        {NAV.filter((item) => hasPermission(user.role, item.permission)).map(
          (item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center rounded-xl text-sm transition-colors ${
                  collapsed
                    ? "justify-center px-0 py-2.5"
                    : "justify-between px-3 py-2.5"
                } ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                  <Icon className="h-4 w-4" />
                  {collapsed ? null : item.label}
                </span>
                {!collapsed && "soon" in item && item.soon ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-sidebar-muted">
                    Yakında
                  </span>
                ) : null}
              </Link>
            );
          },
        )}
      </nav>

      <div className={`border-t border-white/10 ${collapsed ? "p-2" : "p-4"}`}>
        <div
          className={`flex items-center rounded-xl bg-white/5 ${
            collapsed ? "justify-center p-2" : "gap-3 px-3 py-3"
          }`}
          title={`${user.name} · ${roleLabel(user.role)}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <CircleUserRound className="h-5 w-5" />
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {roleLabel(user.role)}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
