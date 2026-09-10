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
        description="Ürün ve rakip firmalar için canlı fiyat taraması, Facebook / Instagram reklam kütüphanesi"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <CompetitorsStudio
          canManage={hasPermission(user.role, PERMISSIONS.COMPETITORS_MANAGE)}
        />
      </main>
    </>
  );
}
