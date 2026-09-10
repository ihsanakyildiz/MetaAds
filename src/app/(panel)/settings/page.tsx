import { Header } from "@/components/layout/header";
import { BudgetGuardSettings } from "@/app/(panel)/settings/budget-guard-settings";
import { MetaSettings } from "@/app/(panel)/settings/meta-settings";
import { requirePermission } from "@/lib/auth";
import { getBudgetGuardSettings } from "@/lib/budget-guard";
import { maskSecret } from "@/lib/crypto";
import { resolveOAuthRedirectUri } from "@/lib/meta";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.SETTINGS_VIEW);

  const params = await searchParams;
  const [config, connection, redirectUri, budgetGuard] = await Promise.all([
    prisma.metaAppConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
    prisma.metaConnection.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        adAccounts: {
          orderBy: { name: "asc" },
        },
      },
    }),
    resolveOAuthRedirectUri(),
    getBudgetGuardSettings(),
  ]);

  return (
    <>
      <Header
        title="Ayarlar"
        description="Meta köprüsü, bütçe koruma kuralları ve sistem yapılandırması"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-6">
        <BudgetGuardSettings initial={budgetGuard} />
        <MetaSettings
          redirectUri={redirectUri}
          connected={params.connected === "1"}
          error={params.error}
          config={
            config
              ? {
                  appId: config.appId,
                  graphVersion: config.graphVersion,
                  updatedAt: config.updatedAt.toISOString(),
                }
              : null
          }
          connection={
            connection
              ? {
                  metaUserName: connection.metaUserName,
                  metaUserId: connection.metaUserId,
                  status: connection.status,
                  tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
                  lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
                  errorMessage: connection.errorMessage,
                  tokenMasked: connection.accessToken
                    ? maskSecret("token-connected", 2)
                    : "",
                  accounts: connection.adAccounts.map((account) => ({
                    id: account.id,
                    metaAccountId: account.metaAccountId,
                    name: account.name,
                    businessName: account.businessName,
                    currency: account.currency,
                    timezoneName: account.timezoneName,
                    accountStatus: account.accountStatus,
                    amountSpent: account.amountSpent,
                  })),
                }
              : null
          }
        />
        </div>
      </main>
    </>
  );
}
