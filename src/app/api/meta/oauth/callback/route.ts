import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  fetchMetaAdAccounts,
  fetchMetaMe,
  getDecryptedMetaConfig,
  resolveOAuthRedirectUri,
} from "@/lib/meta";
import { prisma } from "@/lib/prisma";

function redirectWith(query: string) {
  return NextResponse.redirect(
    new URL(`/settings?${query}`, process.env.APP_URL),
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    return redirectWith(`error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return redirectWith("error=oauth-state");
  }

  const pending = await prisma.metaOAuthState.findUnique({
    where: { state },
  });

  if (!pending || pending.expiresAt < new Date()) {
    return redirectWith("error=oauth-state");
  }

  await prisma.metaOAuthState.delete({
    where: { id: pending.id },
  });

  const config = await getDecryptedMetaConfig();

  if (!config?.appId || !config.appSecret) {
    return redirectWith("error=config");
  }

  const redirectUri = await resolveOAuthRedirectUri();

  try {
    const token = await exchangeCodeForToken(
      config.appId,
      config.appSecret,
      code,
      redirectUri,
      config.graphVersion,
    );
    const me = await fetchMetaMe(token.accessToken, config.graphVersion);
    const accounts = await fetchMetaAdAccounts(
      token.accessToken,
      config.graphVersion,
    );
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000);

    const existing = await prisma.metaConnection.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const connectionData = {
      metaUserId: me.id,
      metaUserName: me.name,
      accessToken: encrypt(token.accessToken),
      tokenExpiresAt: expiresAt,
      status: ConnectionStatus.CONNECTED,
      scopes: "ads_read,ads_management,business_management",
      connectedById: pending.userId,
      lastSyncedAt: new Date(),
      errorMessage: null,
    };

    const connection = existing
      ? await prisma.metaConnection.update({
          where: { id: existing.id },
          data: connectionData,
        })
      : await prisma.metaConnection.create({ data: connectionData });

    await prisma.metaAdAccount.deleteMany({
      where: { connectionId: connection.id },
    });

    if (accounts.length > 0) {
      await prisma.metaAdAccount.createMany({
        data: accounts.map((account) => ({
          connectionId: connection.id,
          metaAccountId: account.id,
          name: account.name,
          accountStatus: account.account_status ?? null,
          currency: account.currency ?? null,
          timezoneName: account.timezone_name ?? null,
          businessName: account.business_name ?? null,
          amountSpent: account.amount_spent ?? null,
          lastSyncedAt: new Date(),
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: pending.userId,
        action: "meta.oauth.connect",
        entity: "meta_connection",
        details: `${me.name} (${accounts.length} hesap)`,
      },
    });

    return redirectWith("connected=1");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta bağlantısı kurulamadı.";

    await prisma.metaConnection.updateMany({
      data: {
        status: ConnectionStatus.ERROR,
        errorMessage: message,
      },
    });

    return redirectWith(`error=${encodeURIComponent(message)}`);
  }
}
