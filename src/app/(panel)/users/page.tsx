import { Header } from "@/components/layout/header";
import { UsersManager } from "@/app/(panel)/users/users-manager";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const currentUser = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <>
      <Header
        title="Kullanıcılar"
        description="Yönetici, analist ve reklam veren erişimleri"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <UsersManager currentUserId={currentUser.id} users={users} />
      </main>
    </>
  );
}
