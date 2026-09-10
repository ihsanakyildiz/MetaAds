import { CreativesStudio } from "@/components/creatives/creatives-studio";
import { Header } from "@/components/layout/header";
import { requirePermission } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function CreativesPage() {
  const user = await requirePermission(PERMISSIONS.CREATIVES_VIEW);

  return (
    <>
      <Header
        title="Kreatif öneriler"
        description="Geçmiş banner ve videolardan satış olasılığı, yeni görsel yükleme ve akıllı kullanım tavsiyesi"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <CreativesStudio
          canUpload={hasPermission(user.role, PERMISSIONS.CREATIVES_UPLOAD)}
        />
      </main>
    </>
  );
}
