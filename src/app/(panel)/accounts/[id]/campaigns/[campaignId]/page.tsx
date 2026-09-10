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

export default async function CampaignAdSetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; campaignId: string }>;
  searchParams: Promise<{
    datePreset?: string;
    since?: string;
    until?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);

  const { id, campaignId } = await params;
  const query = await searchParams;
  const dateRange =
    dateRangeFromSearchParams(query) ?? resolveDateRange("last_30d");

  const campaign = await prisma.metaCampaign.findFirst({
    where: { id: campaignId, accountId: id },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
          timezoneName: true,
        },
      },
      _count: {
        select: { adSets: true },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  const dateQuery = dateRangeSearchParams(dateRange);

  return (
    <>
      <Header
        title={campaign.name}
        description="Bu kampanyadaki reklam setleri"
      />
      <main className="flex-1 space-y-6 overflow-y-auto p-8">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`/accounts/${campaign.account.id}?${dateQuery}`}
            className="inline-flex items-center gap-2 font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {campaign.account.name}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">{campaign.metaCampaignId}</span>
        </div>
        <ChildrenExplorer
          kind="adset"
          parentId={campaign.id}
          currency={campaign.account.currency}
          dateRange={dateRange}
          initialCount={campaign._count.adSets}
          itemHrefPrefix={`/accounts/${campaign.account.id}/campaigns/${campaign.id}/adsets/`}
          itemHrefQuery={dateQuery}
          canManage={hasPermission(user.role, PERMISSIONS.CAMPAIGNS_MANAGE)}
          accountId={campaign.account.id}
          parentObjective={campaign.objective}
          campaignHasBudget={Boolean(
            campaign.dailyBudget || campaign.lifetimeBudget,
          )}
        />
      </main>
    </>
  );
}
