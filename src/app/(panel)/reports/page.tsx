import { Header } from "@/components/layout/header";
import { ReportsExplorer } from "@/components/reports/reports-explorer";
import { requirePermission } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function ReportsPage() {
  const user = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  return (
    <>
      <Header
        title="Raporlar"
        description="Portföy teşhisi, kapat / süre ver / ölçekle ve kırılımlı performans"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <ReportsExplorer
          canPause={hasPermission(user.role, PERMISSIONS.CAMPAIGNS_MANAGE)}
        />
      </main>
    </>
  );
}
