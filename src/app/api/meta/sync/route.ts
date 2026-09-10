import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import {
  fetchMetaAdAccounts,
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
} from "@/lib/meta";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const user = auth.user;
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!config || !tokenData) {
    return NextResponse.json(
      { error: "Önce Meta hesabını bağlayın." },
      { status: 400 },
    );
  }

  try {
    const accounts = await fetchMetaAdAccounts(
      tokenData.accessToken,
      config.graphVersion,
    );

    await prisma.metaAdAccount.deleteMany({
      where: { connectionId: tokenData.connection.id },
    });

    if (accounts.length > 0) {
      await prisma.metaAdAccount.createMany({
        data: accounts.map((account) => ({
          connectionId: tokenData.connection.id,
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

    await prisma.metaConnection.update({
      where: { id: tokenData.connection.id },
      data: {
        status: ConnectionStatus.CONNECTED,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "meta.accounts.sync",
        entity: "meta_ad_account",
        details: `${accounts.length} hesap`,
      },
    });

    return NextResponse.json({ ok: true, count: accounts.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Hesaplar senkronize edilemedi.";

    await prisma.metaConnection.update({
      where: { id: tokenData.connection.id },
      data: {
        status: ConnectionStatus.ERROR,
        errorMessage: message,
      },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
