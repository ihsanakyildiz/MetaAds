import Link from "next/link";
import { Header } from "@/components/layout/header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { accountStatusLabel, isAccountHealthy } from "@/lib/meta-labels";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage() {
  await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);

  const accounts = await prisma.metaAdAccount.findMany({
    orderBy: { name: "asc" },
    include: {
      connection: {
        select: {
          metaUserName: true,
          lastSyncedAt: true,
          status: true,
        },
      },
    },
  });

  return (
    <>
      <Header
        title="Reklam Hesapları"
        description="Meta Business Suite üzerinden içe aktarılan hesaplar"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-semibold">{accounts.length} hesap</h2>
            <p className="mt-1 text-sm text-slate-500">
              Bir hesaba tıklayarak kampanyalarını açın
            </p>
          </div>
          {accounts.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              İçe aktarılmış reklam hesabı yok. Yönetici ayarlar sayfasından
              Meta köprüsünü kurmalı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Hesap</th>
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-6 py-3 font-medium">Saat dilimi</th>
                    <th className="px-6 py-3 font-medium">Para birimi</th>
                    <th className="px-6 py-3 font-medium">Durum</th>
                    <th className="px-6 py-3 font-medium">Harcama</th>
                    <th className="px-6 py-3 font-medium">Senkron</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr
                      key={account.id}
                      className="border-t border-line transition-colors hover:bg-slate-50"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/accounts/${account.id}`}
                          className="block hover:text-accent"
                        >
                          <p className="font-medium">{account.name}</p>
                          <p className="text-xs text-slate-400">
                            {account.metaAccountId}
                          </p>
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {account.businessName ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {account.timezoneName ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {account.currency ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge
                          tone={
                            isAccountHealthy(account.accountStatus)
                              ? "success"
                              : "warning"
                          }
                        >
                          {accountStatusLabel(account.accountStatus)}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {account.amountSpent ?? "0"}
                      </td>
                      <td className="px-6 py-3 text-slate-500">
                        {formatDateTime(
                          account.lastSyncedAt ?? account.connection.lastSyncedAt,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
