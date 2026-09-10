import { CompetitorsStudio } from "@/components/competitors/competitors-studio";
import { Header } from "@/components/layout/header";
import { requirePermission } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function CompetitorsPage() {
  const user = await requirePermission(PERMISSIONS.COMPETITORS_VIEW);

  return (
    <>
      <Header
        title="Rakip analizi"
        description="Rakip mağaza fiyatı ve resmi Meta Reklam Kütüphanesi taraması"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <CompetitorsStudio
          canManage={hasPermission(user.role, PERMISSIONS.COMPETITORS_MANAGE)}
          canScanAds={hasPermission(user.role, PERMISSIONS.META_AD_LIBRARY)}
        />
      </main>
    </>
  );
}
