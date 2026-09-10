import { prisma } from "@/lib/prisma";
import { getDecryptedAccessToken, getDecryptedMetaConfig } from "@/lib/meta";

async function revokeMetaAuthorization() {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!tokenData?.accessToken) {
    return;
  }

  const version = config?.graphVersion || process.env.META_GRAPH_VERSION || "v22.0";

  try {
    await fetch(
      `https://graph.facebook.com/${version}/me/permissions?${new URLSearchParams({
        access_token: tokenData.accessToken,
      }).toString()}`,
      { method: "DELETE", cache: "no-store" },
    );
  } catch {
    // Local wipe still proceeds if Meta revoke is unreachable.
  }
}

export async function disconnectMetaAndWipeImportedData(userId: string) {
  await revokeMetaAuthorization();

  await prisma.$transaction([
    prisma.salesBreakdownStat.deleteMany(),
    prisma.salesProductStat.deleteMany(),
    prisma.salesScoreSnapshot.deleteMany(),
    prisma.salesScore.deleteMany(),
    prisma.salesDailyStat.deleteMany(),
    prisma.budgetGuardAlert.deleteMany(),
    prisma.metaOAuthState.deleteMany(),
    prisma.metaAd.deleteMany(),
    prisma.metaAdSet.deleteMany(),
    prisma.metaCampaign.deleteMany(),
    prisma.metaAdAccount.deleteMany(),
    prisma.metaConnection.deleteMany(),
    prisma.auditLog.create({
      data: {
        userId,
        action: "meta.oauth.disconnect",
        entity: "meta_connection",
        details: "Meta yetkisi iptal edildi, çekilen hesap ve istatistikler silindi.",
      },
    }),
  ]);
}
