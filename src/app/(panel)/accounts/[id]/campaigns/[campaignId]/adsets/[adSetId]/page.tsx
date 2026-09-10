import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChildrenExplorer } from "@/components/ads/children-explorer";
import { Header } from "@/components/layout/header";
import { requirePermission } from "@/lib/auth";
import {
  dateRangeFromSearchParams,
  dateRangeSearchParams,
} from "@/lib/date-query";
import { resolveDateRange } from "@/lib/date-range";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AdSetAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string; adSetId: string }>;
  searchParams: Promise<{
    datePreset?: string;
    since?: string;
    until?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);

  const { id, campaignId, adSetId } = await params;
  const query = await searchParams;
  const dateRange =
    dateRangeFromSearchParams(query) ?? resolveDateRange("last_30d");

  const adSet = await prisma.metaAdSet.findFirst({
    where: {
      id: adSetId,
      campaignId,
      campaign: { accountId: id },
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          account: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
        },
      },
      _count: {
        select: { ads: true },
      },
    },
  });

  if (!adSet) {
    notFound();
  }

  const dateQuery = dateRangeSearchParams(dateRange);

  return (
    <>
      <Header
        title={adSet.name}
        description="Bu reklam setindeki reklamlar"
      />
      <main className="flex-1 space-y-6 overflow-y-auto p-8">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`/accounts/${adSet.campaign.account.id}/campaigns/${adSet.campaign.id}?${dateQuery}`}
            className="inline-flex items-center gap-2 font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {adSet.campaign.name}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">{adSet.metaAdSetId}</span>
        </div>
        <ChildrenExplorer
          kind="ad"
          parentId={adSet.id}
          currency={adSet.campaign.account.currency}
          dateRange={dateRange}
          initialCount={adSet._count.ads}
          canManage={hasPermission(user.role, PERMISSIONS.CAMPAIGNS_MANAGE)}
          accountId={adSet.campaign.account.id}
          canManageSettings={hasPermission(user.role, PERMISSIONS.SETTINGS_META)}
        />
      </main>
    </>
  );
}
