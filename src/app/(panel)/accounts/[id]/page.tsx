import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CampaignExplorer } from "@/components/campaigns/campaign-explorer";
import { Header } from "@/components/layout/header";
import { requirePermission } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AccountCampaignsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);

  const { id } = await params;
  const account = await prisma.metaAdAccount.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      metaAccountId: true,
      businessName: true,
      currency: true,
      timezoneName: true,
      _count: {
        select: { campaigns: true },
      },
    },
  });

  if (!account) {
    notFound();
  }

  return (
    <>
      <Header
        title={account.name}
        description="Bu reklam hesabındaki Meta kampanyaları"
      />
      <main className="flex-1 space-y-6 overflow-y-auto p-8">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Reklam hesaplarına dön
        </Link>
        <p className="text-sm text-slate-500">
          {account.metaAccountId}
          {account.businessName ? ` · ${account.businessName}` : ""}
        </p>
        <CampaignExplorer
          accountId={account.id}
          currency={account.currency}
          timeZone={account.timezoneName}
          autoSync
          initialCount={account._count.campaigns}
          canManage={hasPermission(user.role, PERMISSIONS.CAMPAIGNS_MANAGE)}
        />
      </main>
    </>
  );
}
