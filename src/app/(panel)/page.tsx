import { Header } from "@/components/layout/header";
import { DashboardBoard } from "@/components/dashboard/dashboard-board";
import { requireUser } from "@/lib/auth";
import { greetingForNow } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <>
      <Header
        title="Dashboard"
        description={`${greetingForNow()}, ${user.name.split(" ")[0]} — en iyi kampanyalar, satış setleri ve kreatifler`}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <DashboardBoard
          canManageSettings={hasPermission(user.role, PERMISSIONS.SETTINGS_META)}
        />
      </main>
    </>
  );
}
