import { CampaignExplorer } from "@/components/campaigns/campaign-explorer";
import { Header } from "@/components/layout/header";
import { requirePermission } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function CampaignsPage() {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);

  return (
    <>
      <Header
        title="Kampanyalar"
        description="Tüm hesaplardan çekilen Meta kampanyaları"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <CampaignExplorer
          showAccountColumn
          canManage={hasPermission(user.role, PERMISSIONS.CAMPAIGNS_MANAGE)}
        />
      </main>
    </>
  );
}
